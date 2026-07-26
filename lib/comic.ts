// Server-only module: reads OPENAI_API_KEY and calls external image APIs.
import type {
  CaricatureStyle,
  ComicBuildResult,
  ComicCharacter,
  ComicStripData,
  PanelImageAttempt,
  Story,
  StoryLine,
  StoryPanel,
} from "./types";
import {
  localSoften,
  sanitizeCaptionsForImage,
  type SanitizeLevel,
} from "./safe-rewrite";
import { buildCastSheet } from "./cast-sheet";
import {
  applyContinuity,
  descriptionsWithContinuity,
  emptyContinuity,
  updateContinuityFromCaption,
  wardrobeNotes,
  type ContinuityMap,
} from "./continuity";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const CARICATURE_STYLE_BASE =
  "bold ink outlines, flat vibrant colors, clean white background, single " +
  "character, character reference sheet style";

/** Build the caricature instruction for the chosen harshness/flattery style. */
function caricaturePrompt(style: CaricatureStyle): string {
  switch (style) {
    case "faithful":
      return (
        "Turn this person into a clean cartoon version of themselves that stays " +
        "TRUE TO LIFE. Keep facial proportions, features and skin tone close to " +
        "the photo — only lightly stylise into a cartoon, do NOT exaggerate. " +
        "Preserve every distinctive feature (hair colour/style, eye colour, skin " +
        "tone, glasses, facial hair, notable clothing). " +
        `${CARICATURE_STYLE_BASE}.`
      );
    case "exaggerated":
      return (
        "Turn this person into a BOLD, heavily EXAGGERATED caricature. Greatly " +
        "amplify their most distinctive features (nose, jaw, ears, hair, " +
        "expression) in classic over-the-top caricature style, while keeping " +
        "them clearly recognisable. Preserve hair colour/style, skin tone, " +
        "glasses, facial hair and notable clothing. " +
        `${CARICATURE_STYLE_BASE}.`
      );
    case "flattering":
      return (
        "Turn this person into a FLATTERING, idealised cartoon caricature. " +
        "Enhance their most attractive features and make them look their best — " +
        "glamorous, clear skin, bright eyes, great hair, confident smile — while " +
        "keeping them recognisable. Preserve hair colour/style, skin tone, " +
        "glasses, facial hair and notable clothing. " +
        `${CARICATURE_STYLE_BASE}.`
      );
    case "balanced":
    default:
      return (
        "Transform this person into a cartoon caricature with all distinctive " +
        "facial features clearly preserved (hair colour and style, eye colour, " +
        "skin tone, glasses, facial hair, notable clothing) — moderately " +
        "exaggerated but instantly recognisable. " +
        `${CARICATURE_STYLE_BASE}.`
      );
  }
}
const PANEL_STYLE =
  "fun comic book panel, bold ink outlines, halftone shading, vibrant flat colors, " +
  "expressive cartoon characters, dynamic composition";
// The readable caption is shown beneath each panel in the UI, so the artwork
// itself must contain no lettering.
const NO_TEXT =
  "STRICT RULE — NO TEXT ANYWHERE IN THE IMAGE. The final image must contain " +
  "absolutely no readable characters: no words, no letters, no digits, no " +
  "captions, no titles, no chapter headings, no speech bubbles, no thought " +
  "bubbles, no signs, no book covers, no shop names, no logos, no watermarks, " +
  "no scribbles that resemble writing. All storytelling must be visual only.";

export function hasAiProvider(): boolean {
  return Boolean(OPENAI_API_KEY);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word, Unicode-aware regex matching `needle` (already escaped inside).
 * Shared by every name-lookup/rewrite/scrub helper below so they all use the
 * exact same boundary semantics.
 */
function wordBoundaryRegex(needle: string, flags: string): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(needle)}(?!\\p{L})`, flags);
}

/** Split a finished story into 3-6 comic panels deterministically. */
export function scriptPanels(story: Story): Omit<StoryPanel, "imageUrl">[] {
  const lines = story.lines;
  if (lines.length === 0) return [];

  const targetPanels = Math.min(6, Math.max(3, Math.ceil(lines.length / 2)));
  const perPanel = Math.ceil(lines.length / targetPanels);

  const groups: StoryLine[][] = [];
  for (let i = 0; i < lines.length; i += perPanel) {
    groups.push(lines.slice(i, i + perPanel));
  }

  const storyCast = story.characters ?? [];

  return groups.map((group, index) => {
    const caption = group
      .map((l) => l.display)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Default every panel to the story's two leads (person1/person2). Those
    // are the same people throughout unless a free-text answer explicitly
    // names someone else (via the person-insert dropdown). Extra named people
    // are ADDED; leads are never dropped just because a line only mentions one
    // of them — that was swapping/dropping faces across panels.
    // Legacy stories with no resolved cast fall back to the panel's line authors.
    let characters: ComicCharacter[];
    if (storyCast.length > 0) {
      const leads = storyCast.slice(0, 2);
      const extras = storyCast
        .slice(2)
        .filter((c) => mentionsName(caption, c.name));
      characters = [...leads, ...extras];
    } else {
      characters = [];
      for (const line of group) {
        if (!characters.some((c) => c.id === line.playerId)) {
          characters.push({
            id: line.playerId,
            name: line.playerName,
            imageUrl: line.playerAvatarUrl,
          });
        }
      }
    }

    return {
      index,
      caption,
      sceneDescription: buildSceneDescription(caption, characters),
      characters,
    };
  });
}

/** Whole-word, case-insensitive, Unicode-aware name mention check. */
function mentionsName(text: string, name: string): boolean {
  const needle = name.trim();
  if (!needle) return false;
  return wordBoundaryRegex(needle, "iu").test(text);
}

function buildSceneDescription(caption: string, characters: ComicCharacter[]): string {
  // Use neutral labels here too — this field is review/debug only and must
  // not reintroduce real names into anything that might reach an image model.
  const labels = characters.map((_, i) => `Character ${i + 1}`);
  return (
    `Illustrate this story moment: ${caption}` +
    (labels.length ? ` Featuring ${labels.join(" and ")}.` : "") +
    ` Style: ${PANEL_STYLE}.`
  );
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith("data:")) {
      const res = await fetch(url);
      return await res.blob();
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Caricature generation once, retried once on failure — image generation is
 * non-deterministic and an occasional flaky refusal shouldn't drop a character.
 */
async function generateCaricatureWithRetry(
  imageUrl: string,
  style: CaricatureStyle
): Promise<string | null> {
  return (await generateCaricature(imageUrl, style)) ?? (await generateCaricature(imageUrl, style));
}

/** Turn an uploaded photo into a cartoon caricature (OpenAI image edit). */
export async function generateCaricature(
  imageUrl: string,
  style: CaricatureStyle = "balanced"
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const blob = await fetchAsBlob(imageUrl);
  if (!blob) return null;

  try {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", blob, "photo.png");
    form.append("prompt", caricaturePrompt(style));
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("moderation", "low");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch {
    return null;
  }
}

/**
 * Ask a vision LLM to describe the caricature in enough detail that an artist
 * could draw an original lookalike from the words alone. This description is
 * the PRIMARY identity anchor in panel prompts: we refer to each character by
 * their features (not their real name), so the image model draws a similar
 * original cartoon character rather than trying to depict a real/known person.
 * Cheap gpt-4o-mini call; returns "" on any failure.
 */
const DESCRIBE_SYSTEM_PROMPT =
  "You are a character-design assistant creating a MODEL SHEET so another " +
  "artist can redraw this exact cartoon character consistently from words " +
  "alone, without ever seeing the picture. Study the image and output a " +
  "single dense description covering EVERY field below (skip a field only if " +
  "genuinely not visible). Be specific and concrete — say 'short wavy auburn " +
  "hair swept to the right', not just 'brown hair'.\n\n" +
  "Fields, in this order, as one flowing comma-separated description:\n" +
  "• Perceived gender presentation and approximate age range\n" +
  "• Build / body type\n" +
  "• Skin tone\n" +
  "• Face shape and notable facial structure (jaw, cheeks, nose)\n" +
  "• Hair: colour, length, texture, style/parting (or bald)\n" +
  "• Eyebrows and eye colour/shape\n" +
  "• Facial hair (style + colour) or clean-shaven\n" +
  "• Glasses/accessories (shape, colour) if any\n" +
  "• Distinctive marks (freckles, dimples, moles, etc.)\n" +
  "• Notable clothing (colour + type) and any headwear\n\n" +
  "Rules: 45-75 words, physical appearance ONLY. Do NOT name, guess, or refer " +
  "to any real or famous person. No preamble, no bullet characters — just the " +
  "description sentence(s).";

async function describeCaricature(imageUrl: string): Promise<string> {
  // Accept both the caricature data URL and a plain http(s) photo URL — the
  // vision endpoint handles either, and describing the original photo is a
  // valuable fallback when caricature generation flakes out.
  const usable =
    imageUrl.startsWith("data:image") || /^https?:\/\//i.test(imageUrl);
  if (!OPENAI_API_KEY || !usable) return "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: DESCRIBE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Create the model-sheet description for this character:" },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        // Deterministic so the same photo yields the same description every run.
        temperature: 0,
        max_tokens: 260,
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

/**
 * Extract the final assistant text from an OpenAI Responses API payload.
 * Falls back across the convenience `output_text` field and the `output`
 * array of message items.
 */
function extractResponsesText(data: unknown): string {
  const d = data as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: unknown }>;
    }>;
  };
  if (typeof d?.output_text === "string" && d.output_text.trim()) {
    return d.output_text;
  }
  const output = d?.output;
  if (!Array.isArray(output)) return "";
  for (let i = output.length - 1; i >= 0; i--) {
    const item = output[i];
    if (item?.type === "message" && Array.isArray(item.content)) {
      const part = item.content.find(
        (c) => c?.type === "output_text" && typeof c.text === "string"
      );
      if (part && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

// Process-level cache so a given typed name is only looked up once, even
// across stories / regenerate clicks within the same server process.
const personLookupCache = new Map<string, string>();

/**
 * Scrub a looked-up description so no name (nor citation markup) leaks into
 * the image prompt: drop markdown/citation links, remove a leading "Name(s)
 * is/was a …" subject clause, strip the surrounding quotes, and remove any
 * remaining occurrences of the typed name.
 */
function cleanupPersonDescription(text: string, name: string): string {
  let out = text.trim().replace(/^["']|["']$/g, "");
  // Remove markdown links and parenthetical citations: ([label](url)) / [label](url)
  out = out.replace(/\(\[[^\]]*\]\([^)]*\)\)/g, "");
  out = out.replace(/\[[^\]]*\]\([^)]*\)/g, "");
  // Drop a leading "<Name ...> is/was/are a|an|the " subject clause.
  out = out.replace(/^[^.]*?\b(?:is|was|are|were)\s+(a|an|the)\s+/i, "$1 ");
  // Remove any remaining occurrences of each token of the typed name.
  for (const token of name.split(/\s+/)) {
    const t = token.trim();
    if (t.length < 2) continue;
    out = out.replace(wordBoundaryRegex(t, "giu"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

/**
 * When a player types a NAME that has no uploaded photo, try to find a physical
 * description online (via the OpenAI Responses web-search tool) so the image
 * model can draw a matching likeness. Returns "" for ordinary names that don't
 * resolve to a recognisable public figure. The name itself is never sent to
 * the image model — only the resulting appearance description.
 */
async function lookupPersonDescription(name: string): Promise<string> {
  if (!OPENAI_API_KEY) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  const cacheKey = trimmed.toLowerCase();
  const cached = personLookupCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result = "";
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        temperature: 0,
        input:
          `A player in a party game typed "${trimmed}" as a character name. ` +
          `Decide whether this clearly refers to a SPECIFIC, widely-recognised ` +
          `real public figure (celebrity, musician, actor, athlete, politician, ` +
          `historical figure, etc.). Search the web to confirm their appearance ` +
          `if helpful.\n\n` +
          `If YES: reply with ONLY a 45-75 word physical-appearance description ` +
          `an artist could use to draw a caricature. Begin DIRECTLY with the ` +
          `appearance (e.g. "a 40-year-old woman with...") and cover perceived ` +
          `gender & age range, build, skin tone, face shape, hair ` +
          `(colour/length/style), facial hair, glasses/accessories, ` +
          `distinctive features, and their typical/signature clothing or look. ` +
          `Physical appearance ONLY. Do NOT include the person's name anywhere, ` +
          `no citations, no commentary.\n\n` +
          `If it is NOT a clearly recognisable public figure (e.g. an ordinary ` +
          `first name like "Dave" or "Sarah"), reply with exactly: NONE`,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = extractResponsesText(data).trim();
      if (text && !/^none\b/i.test(text) && text.length >= 12) {
        result = cleanupPersonDescription(text, trimmed);
      }
    }
  } catch {
    result = "";
  }

  personLookupCache.set(cacheKey, result);
  return result;
}

/** Whole-word, Unicode-aware replacement of a character's name with a label. */
function replaceNameWithLabel(text: string, name: string, label: string): string {
  const needle = name.trim();
  if (!needle) return text;
  return text.replace(wordBoundaryRegex(needle, "giu"), label);
}

type PanelCharacter = {
  id: string;
  name: string;
  label: string;
  description: string;
  image?: string;
};

/**
 * Assign each panel character a neutral label ("Character 1", ...) plus its
 * feature description and (when available) reference caricature. Rewrite the
 * caption so character names become their labels — the image model then works
 * from features + label, never a real identity.
 */
function buildPanelCast(
  characters: ComicCharacter[],
  descriptions: Map<string, string>,
  caricatures: Map<string, string | null>
): { cast: PanelCharacter[]; sceneCaptionRewriter: (caption: string) => string } {
  const cast: PanelCharacter[] = characters.map((c, i) => ({
    id: c.id,
    name: c.name,
    label: `Character ${i + 1}`,
    description: descriptions.get(c.id) ?? "",
    image: caricatures.get(c.id) ?? c.imageUrl ?? undefined,
  }));

  const sceneCaptionRewriter = (caption: string): string => {
    let out = caption;
    for (const pc of cast) {
      out = replaceNameWithLabel(out, pc.name, pc.label);
    }
    return out;
  };

  return { cast, sceneCaptionRewriter };
}

const FICTIONAL_NOTE =
  "IMPORTANT: the people below are ORIGINAL FICTIONAL cartoon characters, each " +
  "defined ONLY by the feature description given. They are NOT real, famous or " +
  "identifiable individuals — draw an original cartoon character that matches " +
  "the described features. Keep each character's look identical in every panel.";

/**
 * Guarantee the scene text references every character, so that even after the
 * caption has been softened on a moderation retry (which can shift the focus
 * onto one person) the image still contains everyone.
 */
function ensureAllPresent(scene: string, cast: PanelCharacter[]): string {
  if (cast.length <= 1) return scene;
  const labels = cast.map((c) => c.label);
  return (
    `${scene} (This panel must include ALL of ${labels.join(", ")} together, ` +
    `each drawn to their own description above — do not drop or merge anyone.)`
  );
}

/** Build the "CHARACTER GUIDE" block describing each character by features. */
function buildCharacterGuide(cast: PanelCharacter[], withCastSheet: boolean): string {
  return cast
    .map((pc) => {
      const tile = withCastSheet && pc.image
        ? ` (also shown on the attached cast sheet, tile labelled "${pc.label.toUpperCase()}")`
        : "";
      const features = pc.description
        ? pc.description
        : "an original cartoon character — invent a distinct, consistent look";
      // Wardrobe baked into the description is the source of truth for props
      // like hats — call it out so the model doesn't drop it between panels.
      const wardrobeNote = /STORY WARDROBE/i.test(features)
        ? " Honour the STORY WARDROBE in this description in this panel."
        : "";
      return `  • ${pc.label}${tile}: ${features}.${wardrobeNote}`;
    })
    .join("\n");
}

/**
 * Text-to-image fallback (no reference photos). Characters are still described
 * by features + neutral labels so we get consistent lookalikes, not real people.
 */
type PanelResult = {
  imageUrl: string | null;
  prompt: string;
  /** True when the image API refused for safety/moderation. */
  blocked?: boolean;
  /** True when OpenAI returned a rate-limit (429) — caller should wait & retry. */
  rateLimited?: boolean;
  /** Human-readable explanation of why generation failed (when imageUrl is null). */
  reason?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeModerationBlock(status: number, body: string): boolean {
  if (status === 400 || status === 403 || status === 451) {
    const lower = body.toLowerCase();
    return (
      lower.includes("moderation") ||
      lower.includes("safety") ||
      lower.includes("refus") ||
      lower.includes("not allowed") ||
      lower.includes("content policy") ||
      lower.includes("violat") ||
      lower.includes("blocked") ||
      lower.includes("sensitive")
    );
  }
  return false;
}

/** Turn an OpenAI image API error into a short, user-facing reason. */
function explainImageApiFailure(status: number, body: string): string {
  const lower = body.toLowerCase();
  let apiMessage = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string; type?: string };
    };
    apiMessage = parsed?.error?.message?.trim() || "";
  } catch {
    apiMessage = body.replace(/\s+/g, " ").trim().slice(0, 180);
  }

  if (looksLikeModerationBlock(status, body)) {
    return apiMessage
      ? `Blocked by image moderation: ${apiMessage}`
      : "Blocked by image moderation (content filter refused the prompt).";
  }
  if (status === 401 || status === 403) {
    return apiMessage || "OpenAI API key rejected (unauthorized).";
  }
  if (status === 429 || lower.includes("rate_limit") || lower.includes("quota")) {
    return apiMessage || "OpenAI rate limit / quota exceeded — try again shortly.";
  }
  if (status === 402 || lower.includes("billing") || lower.includes("insufficient")) {
    return apiMessage || "OpenAI billing/credits issue — check your account balance.";
  }
  if (status >= 500) {
    return apiMessage || `OpenAI server error (HTTP ${status}).`;
  }
  if (status > 0) {
    return apiMessage || `Image API error (HTTP ${status}).`;
  }
  return apiMessage || "Image API request failed.";
}

/**
 * Final safety net: replace any leftover real character names in a prompt
 * with their Character N labels so the image model never sees real identities.
 */
function scrubRealNamesFromPrompt(
  prompt: string,
  people: { name: string; label: string }[]
): string {
  let out = prompt;
  // Longer names first so "Mary Anne" wins over "Mary".
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const { name, label } of sorted) {
    const needle = name.trim();
    if (!needle) continue;
    out = out.replace(wordBoundaryRegex(needle, "giu"), label);
  }
  return out;
}

async function generatePanelFromTextCast(
  sceneWithLabels: string,
  cast: PanelCharacter[]
): Promise<PanelResult> {
  const guide = cast.length ? buildCharacterGuide(cast, false) : "";
  const labelList = cast.map((c) => c.label).join(", ");
  const guideBlock = guide
    ? `${FICTIONAL_NOTE}\n\nCHARACTER GUIDE:\n${guide}\n\n` +
      `All of these characters (${labelList}) must appear in the panel doing ` +
      `exactly what the scene says; do not swap or omit anyone.\n\n`
    : "";
  const scene = ensureAllPresent(sceneWithLabels, cast);
  const prompt = scrubRealNamesFromPrompt(
    `${NO_TEXT}\n\n${guideBlock}SCENE: ${scene}\n\n` +
      `STYLE: ${PANEL_STYLE}.\n\n${NO_TEXT}`,
    cast
  );

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "low",
        moderation: "low",
        n: 1,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const blocked = looksLikeModerationBlock(res.status, body);
      const rateLimited = res.status === 429;
      const reason = explainImageApiFailure(res.status, body);
      console.warn(
        `[comic] text-to-image failed status=${res.status} blocked=${blocked} ` +
          `rateLimited=${rateLimited} reason=${reason}`
      );
      return { imageUrl: null, prompt, blocked, rateLimited, reason };
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return {
        imageUrl: null,
        prompt,
        reason: "Image API returned success but no image data.",
      };
    }
    return { imageUrl: `data:image/png;base64,${b64}`, prompt };
  } catch (err) {
    return {
      imageUrl: null,
      prompt,
      reason: `Network error calling image API: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }
}

/**
 * Generate a single comic panel. Characters are described by their FEATURES
 * (from the caricature) under neutral labels, and the caption is rewritten so
 * those labels replace the real names. When reference caricatures exist they
 * are composited into one labelled cast sheet and attached as a visual anchor.
 * This keeps the drawn people consistent lookalikes instead of the model
 * substituting random or famous-looking people for named characters.
 */
async function generatePanelImage(
  caption: string,
  characters: ComicCharacter[],
  descriptions: Map<string, string>,
  caricatures: Map<string, string | null>,
  options: { textOnly?: boolean } = {}
): Promise<PanelResult> {
  if (!OPENAI_API_KEY) {
    return {
      imageUrl: null,
      prompt: "",
      reason: "No OpenAI API key configured on the server.",
    };
  }

  const { cast, sceneCaptionRewriter } = buildPanelCast(
    characters,
    descriptions,
    caricatures
  );
  // Caption may already be label-substituted by the caller; run again so any
  // leftover real names become Character N before the prompt is built.
  const labeledScene = sceneCaptionRewriter(caption);
  const withRefs = cast.filter((c) => c.image);

  // Soften retries use text-only to avoid burning the 5 input-images/min
  // cast-sheet quota. Feature descriptions still keep likeness.
  if (options.textOnly || withRefs.length === 0) {
    return generatePanelFromTextCast(labeledScene, cast);
  }

  const castSheetBuf = await buildCastSheet(
    withRefs.map((c) => ({ name: c.label, imageUrl: c.image as string }))
  );
  if (!castSheetBuf) {
    return generatePanelFromTextCast(labeledScene, cast);
  }

  const castSheetBlob = new Blob([new Uint8Array(castSheetBuf)], { type: "image/png" });
  const guide = buildCharacterGuide(cast, true);
  const labelList = cast.map((c) => c.label).join(", ");
  const scene = ensureAllPresent(labeledScene, cast);

  const prompt = scrubRealNamesFromPrompt(
    `${NO_TEXT}\n\n` +
      `TASK: draw ONE brand-new comic panel illustrating the scene below.\n\n` +
      `${FICTIONAL_NOTE}\n\n` +
      `CHARACTER GUIDE (match these features precisely):\n${guide}\n\n` +
      `A cast sheet is attached: each tile shows one character with their label ` +
      `printed beneath. Use it together with the feature descriptions above.\n\n` +
      `IDENTITY RULES (highest priority):\n` +
      `  • Draw each character to match BOTH their cast-sheet tile AND their ` +
      `feature description exactly (age/build, skin tone, hair, facial hair, ` +
      `glasses, notable clothing). Keep them consistent across panels.\n` +
      `  • Do NOT swap features between characters, do NOT merge them, do NOT ` +
      `replace anyone with a random or famous-looking person.\n` +
      `  • EVERY character listed MUST appear in the panel, even if the scene ` +
      `sentence only names some of them: ${labelList}.\n` +
      `  • Prefer a wider composition over leaving anyone out.\n\n` +
      `SCENE: ${scene}\n\n` +
      `STYLE: ${PANEL_STYLE}. This is a NEW illustration, not a re-crop or ` +
      `re-style of the reference sheet.\n\n` +
      `${NO_TEXT}`,
    cast
  );

  let editBlocked = false;
  let editRateLimited = false;
  let editReason: string | undefined;
  try {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", castSheetBlob, "cast-sheet.png");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("moderation", "low");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (b64) return { imageUrl: `data:image/png;base64,${b64}`, prompt };
      editReason = "Image-edit API returned success but no image data.";
    } else {
      const body = await res.text().catch(() => "");
      editBlocked = looksLikeModerationBlock(res.status, body);
      editRateLimited = res.status === 429;
      editReason = explainImageApiFailure(res.status, body);
      console.warn(
        `[comic] image-edit failed status=${res.status} blocked=${editBlocked} ` +
          `rateLimited=${editRateLimited} reason=${editReason}`
      );
    }
  } catch (err) {
    editReason = `Network error calling image-edit API: ${
      err instanceof Error ? err.message : "unknown"
    }`;
  }

  // Fall back to text-to-image, but keep the richer cast-sheet prompt as the
  // record of what we asked for (it's the more descriptive instruction).
  // If the edit call was rate-limited, skip the immediate text fallback — the
  // caller will wait and retry rather than burning more quota instantly.
  if (editRateLimited) {
    return {
      imageUrl: null,
      prompt,
      blocked: editBlocked,
      rateLimited: true,
      reason: editReason,
    };
  }

  const fallback = await generatePanelFromTextCast(labeledScene, cast);
  if (fallback.imageUrl) {
    return {
      imageUrl: fallback.imageUrl,
      prompt: fallback.prompt,
      blocked: editBlocked || fallback.blocked,
    };
  }
  return {
    imageUrl: null,
    prompt,
    blocked: editBlocked || fallback.blocked,
    rateLimited: fallback.rateLimited,
    reason: [
      editReason ? `Edit: ${editReason}` : null,
      fallback.reason ? `Text fallback: ${fallback.reason}` : null,
    ]
      .filter(Boolean)
      .join(" → ") || "Image generation failed for an unknown reason.",
  };
}

/** Strip baked-in wardrobe so resume can rebuild continuity from captions. */
function stripWardrobeSuffix(description: string): string {
  return description.replace(/\.\s*STORY WARDROBE\b[\s\S]*$/i, "").trim();
}

function lastSuccessfulAttemptCaption(
  attempts: PanelImageAttempt[] | undefined
): string | undefined {
  if (!attempts?.length) return undefined;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].ok && attempts[i].caption?.trim()) {
      return attempts[i].caption;
    }
  }
  return undefined;
}

/**
 * Build (or resume) a comic strip from a finished story.
 *
 * Each call has a ~280s budget. Pass `previousComic` from an incomplete chunk
 * to skip finished panels and reuse cast/caricatures/wardrobe continuity.
 * The client should keep calling until `complete` is true.
 */
export async function buildComic(
  story: Story,
  style: CaricatureStyle = "balanced",
  previousComic?: ComicStripData | null
): Promise<ComicBuildResult> {
  const buildStart = Date.now();
  const scripted = scriptPanels(story);

  if (!hasAiProvider()) {
    const comic: ComicStripData = {
      mode: "photo",
      panels: scripted.map((p) => ({ ...p })),
    };
    return { comic, complete: true, pendingPanelIndexes: [], generatedThisChunk: 0 };
  }

  const previousByIndex = new Map<number, StoryPanel>();
  for (const p of previousComic?.panels ?? []) {
    previousByIndex.set(p.index, p);
  }

  // STEP 1 — lock character identity (reuse prior cast on resume).
  const storyCast = resolveStoryCast(story, scripted);
  const caricatureCache = new Map<string, string | null>();
  const descriptionCache = new Map<string, string>();
  const descriptionSource = new Map<string, "photo" | "web">();
  const resolveImage = (c: ComicCharacter): string | undefined =>
    caricatureCache.get(c.id) ?? c.imageUrl;

  // Seed caches from a previous chunk so we don't re-caricature / re-lookup.
  for (const prev of previousComic?.cast ?? []) {
    if (prev.imageUrl) caricatureCache.set(prev.id, prev.imageUrl);
    const base = stripWardrobeSuffix(prev.description ?? "");
    if (base) descriptionCache.set(prev.id, base);
    if (prev.descriptionSource) {
      descriptionSource.set(prev.id, prev.descriptionSource);
    }
  }

  await Promise.all(
    storyCast.map(async (c) => {
      // Already have a likeness description from a prior chunk — keep it.
      if (descriptionCache.has(c.id) || caricatureCache.has(c.id)) {
        if (!descriptionCache.has(c.id) && c.imageUrl) {
          const desc = await describeCaricature(
            (caricatureCache.get(c.id) || c.imageUrl) as string
          );
          if (desc) {
            descriptionCache.set(c.id, desc);
            descriptionSource.set(c.id, "photo");
          }
        }
        return;
      }

      if (c.imageUrl) {
        const caricature = await generateCaricatureWithRetry(
          c.imageUrl as string,
          style
        );
        caricatureCache.set(c.id, caricature);
        const desc = await describeCaricature(
          caricature ?? (c.imageUrl as string)
        );
        if (desc) {
          descriptionCache.set(c.id, desc);
          descriptionSource.set(c.id, "photo");
        }
        if (!caricature) {
          console.warn(
            `[comic] caricature failed for "${c.name}", using original photo + description`
          );
        }
      } else {
        const desc = await lookupPersonDescription(c.name);
        if (desc) {
          descriptionCache.set(c.id, desc);
          descriptionSource.set(c.id, "web");
        }
      }
    })
  );

  const cast: ComicCharacter[] = storyCast.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: resolveImage(c),
    description: descriptionCache.get(c.id) ?? "",
    descriptionSource: descriptionSource.get(c.id),
  }));

  // Per-chunk budget. Incomplete comics are resumed by the client with a
  // fresh budget while keeping finished panels + cast continuity.
  const OVERALL_DEADLINE_MS = 280_000;
  const MIN_ATTEMPT_MS = 18_000;
  const deadline = buildStart + OVERALL_DEADLINE_MS;
  const canAttempt = () => Date.now() < deadline - MIN_ATTEMPT_MS;

  const panels: StoryPanel[] = [];
  let generatedThisChunk = 0;
  const continuity: ContinuityMap = emptyContinuity();
  const baseDescriptions = new Map(descriptionCache);

  for (let panelIdx = 0; panelIdx < scripted.length; panelIdx++) {
    const panel = scripted[panelIdx];
    const previousPanel = previousByIndex.get(panel.index);

    const labelingCharacters = panel.characters.map((c) => ({
      ...c,
      imageUrl: resolveImage(c),
      description: baseDescriptions.get(c.id) ?? c.description ?? "",
    }));
    const { cast: panelCast, sceneCaptionRewriter } = buildPanelCast(
      labelingCharacters,
      baseDescriptions,
      caricatureCache
    );
    const labeledCaption = sceneCaptionRewriter(panel.caption);
    const labelNames = panelCast.map((c) => c.label);

    // Always advance wardrobe from this panel's story text so later panels
    // (including after a resume) stay consistent.
    updateContinuityFromCaption(continuity, labeledCaption, panelCast);

    // Finished in a prior chunk — keep the image and fold any softened caption
    // into continuity, then move on (no API calls).
    if (previousPanel?.imageUrl) {
      const softCaption = lastSuccessfulAttemptCaption(
        previousPanel.imageAttempts
      );
      if (softCaption && softCaption.trim() !== labeledCaption.trim()) {
        updateContinuityFromCaption(continuity, softCaption, panelCast);
      }
      const liveDescriptions = descriptionsWithContinuity(
        baseDescriptions,
        continuity,
        [...baseDescriptions.keys(), ...panelCast.map((c) => c.id)]
      );
      for (const [id, desc] of liveDescriptions) {
        descriptionCache.set(id, desc);
      }
      panels.push({
        ...previousPanel,
        characters: previousPanel.characters.map((c) => ({
          ...c,
          imageUrl: resolveImage(c) ?? c.imageUrl,
          description: descriptionCache.get(c.id) ?? c.description,
        })),
      });
      continue;
    }

    const liveDescriptions = descriptionsWithContinuity(
      baseDescriptions,
      continuity,
      [...baseDescriptions.keys(), ...panelCast.map((c) => c.id)]
    );
    for (const [id, desc] of liveDescriptions) {
      descriptionCache.set(id, desc);
    }

    const characters = panel.characters.map((c) => ({
      ...c,
      imageUrl: resolveImage(c),
      description: liveDescriptions.get(c.id) ?? c.description ?? "",
    }));

    const withContinuity = applyContinuity(
      labeledCaption,
      panelCast,
      continuity
    );
    const baseCaption = withContinuity.caption;
    const wardrobe = wardrobeNotes(continuity, panelCast);
    if (wardrobe.length > 0) {
      console.log(
        `[comic] panel ${panelIdx} wardrobe in character descriptions: ` +
          wardrobe.join("; ")
      );
    }
    if (withContinuity.notes.length > 0) {
      console.log(
        `[comic] panel ${panelIdx} scene continuity: ${withContinuity.notes.join("; ")}`
      );
    }

    // Out of time for this chunk — leave panel unfinished for the next resume.
    if (!canAttempt()) {
      console.warn(
        `[comic] panel ${panelIdx} deferred — chunk time budget exhausted ` +
          `(will resume in a follow-up request)`
      );
      panels.push({
        ...panel,
        characters,
        imageFailureReason:
          "Deferred — comic time budget reached; continuing in next pass.",
        imageAttempts: [
          {
            attempt: "deferred",
            ok: false,
            reason: "Skipped — overall comic time budget exhausted.",
          },
        ],
        continuityNote:
          [
            ...wardrobe.map((w) => `In character sheet: ${w}`),
            ...withContinuity.notes,
          ].join("; ") || undefined,
      });
      // Still walk remaining panels to keep continuity + stubs consistent.
      continue;
    }

    type Attempt = { label: string; caption: string; textOnly?: boolean };
    let result: PanelResult = { imageUrl: null, prompt: "" };
    const tried = new Set<string>();
    const attemptLog: PanelImageAttempt[] = [];
    let lastRefusedCaption = baseCaption;
    let successfulCaption: string | undefined;
    let useTextOnly = false;

    const runAttempt = async (a: Attempt) => {
      const key = `${a.textOnly ? "t:" : "e:"}${a.caption.trim()}`;
      if (tried.has(key)) return;
      tried.add(key);

      for (let rateTry = 0; rateTry < 3; rateTry++) {
        if (!canAttempt()) {
          attemptLog.push({
            attempt: a.label,
            ok: false,
            reason: "Skipped — overall comic time budget exhausted.",
            caption: a.caption.slice(0, 160),
          });
          return;
        }
        const t0 = Date.now();
        result = await generatePanelImage(
          a.caption,
          characters,
          liveDescriptions,
          caricatureCache,
          { textOnly: a.textOnly || useTextOnly }
        );
        if (result.imageUrl) {
          successfulCaption = a.caption;
          attemptLog.push({
            attempt: a.label,
            ok: true,
            caption: a.caption.slice(0, 160),
          });
          console.log(
            `[comic] panel ${panelIdx} attempt=${a.label} imageOk=true ` +
              `took=${Date.now() - t0}ms remaining=${deadline - Date.now()}ms ` +
              `caption=${JSON.stringify(a.caption.slice(0, 80))}`
          );
          return;
        }

        if (result.rateLimited && rateTry < 2) {
          const waitMs = 15_000;
          console.warn(
            `[comic] panel ${panelIdx} rate-limited on ${a.label}, ` +
              `waiting ${waitMs}ms then retrying same caption`
          );
          attemptLog.push({
            attempt: `${a.label}-ratewait`,
            ok: false,
            reason: `Rate limited — waiting ${waitMs / 1000}s then retrying.`,
            caption: a.caption.slice(0, 160),
          });
          await sleep(waitMs);
          continue;
        }

        const reason =
          result.reason ||
          (result.blocked
            ? "Blocked by image moderation."
            : "Image generation failed.");
        lastRefusedCaption = a.caption;
        if (result.blocked) useTextOnly = true;
        attemptLog.push({
          attempt: a.label,
          ok: false,
          reason,
          caption: a.caption.slice(0, 160),
        });
        console.log(
          `[comic] panel ${panelIdx} attempt=${a.label} imageOk=false ` +
            `blocked=${Boolean(result.blocked)} ` +
            `took=${Date.now() - t0}ms remaining=${deadline - Date.now()}ms ` +
            `reason=${reason} caption=${JSON.stringify(a.caption.slice(0, 80))}`
        );
        return;
      }
    };

    await runAttempt({ label: "raw", caption: baseCaption });

    const levels: SanitizeLevel[] = [0, 1, 2];
    for (const level of levels) {
      if (result.imageUrl) break;
      if (!canAttempt()) {
        attemptLog.push({
          attempt: `soft${level}`,
          ok: false,
          reason: "Skipped — overall comic time budget exhausted.",
        });
        break;
      }

      let softer = localSoften(baseCaption, level, labelNames);
      if (
        !softer ||
        tried.has(`t:${softer.trim()}`) ||
        tried.has(`e:${softer.trim()}`)
      ) {
        const [llmSoft] = await sanitizeCaptionsForImage(
          [
            {
              caption: baseCaption,
              names: labelNames,
              refusedCaption: lastRefusedCaption,
            },
          ],
          level,
          { force: true }
        );
        if (llmSoft && llmSoft.trim() !== baseCaption.trim()) {
          softer = llmSoft;
        }
      }
      if (!softer || softer.trim() === baseCaption.trim()) continue;
      if (tried.has(`t:${softer.trim()}`) || tried.has(`e:${softer.trim()}`)) {
        continue;
      }

      await runAttempt({
        label: `soft${level}`,
        caption: softer,
        textOnly: true,
      });
    }

    if (
      successfulCaption &&
      successfulCaption.trim() !== labeledCaption.trim()
    ) {
      updateContinuityFromCaption(continuity, successfulCaption, panelCast);
      const afterSoft = descriptionsWithContinuity(
        baseDescriptions,
        continuity,
        descriptionCache.keys()
      );
      for (const [id, desc] of afterSoft) {
        descriptionCache.set(id, desc);
      }
    }

    const budgetExhausted = attemptLog.some(
      (a) => a.reason?.includes("time budget exhausted")
    );
    const failureReason = result.imageUrl
      ? undefined
      : budgetExhausted
        ? "Deferred — comic time budget reached; continuing in next pass."
        : attemptLog
            .filter((a) => !a.ok && a.reason)
            .map((a) => `${a.attempt}: ${a.reason}`)
            .join(" | ") ||
          result.reason ||
          "All image attempts failed.";

    if (result.imageUrl) {
      generatedThisChunk += 1;
    } else {
      console.warn(
        `[comic] panel ${panelIdx} produced no image, ` +
          `total=${Date.now() - buildStart}ms reason=${failureReason}`
      );
    }

    const noteParts = [
      ...wardrobe.map((w) => `In character sheet: ${w}`),
      ...withContinuity.notes,
    ];

    panels.push({
      ...panel,
      characters: characters.map((c) => ({
        ...c,
        description: descriptionCache.get(c.id) ?? c.description,
      })),
      imageUrl: result.imageUrl ?? undefined,
      imagePrompt: result.prompt || undefined,
      imageFailureReason: failureReason,
      imageAttempts: attemptLog,
      continuityNote: noteParts.length > 0 ? noteParts.join("; ") : undefined,
    });
  }

  const finalDescriptions = descriptionsWithContinuity(
    baseDescriptions,
    continuity,
    baseDescriptions.keys()
  );
  const castWithWardrobe: ComicCharacter[] = cast.map((c) => ({
    ...c,
    description: finalDescriptions.get(c.id) ?? c.description,
  }));

  const anyImages = panels.some((p) => p.imageUrl);
  const pendingPanelIndexes = panels
    .filter((p) => !p.imageUrl)
    .map((p) => p.index);
  // "complete" means every panel that still needs an image either has one, or
  // failed for a non-budget reason (so another chunk won't help). Budget
  // deferrals keep complete=false so the client resumes.
  const pendingBudget = panels.some(
    (p) =>
      !p.imageUrl &&
      (p.imageFailureReason?.includes("continuing in next pass") ||
        p.imageAttempts?.some((a) =>
          a.reason?.includes("time budget exhausted")
        ))
  );
  const complete = !pendingBudget;

  const comic: ComicStripData = {
    mode: anyImages ? "ai" : "photo",
    panels,
    cast: castWithWardrobe,
  };

  console.log(
    `[comic] chunk done complete=${complete} generated=${generatedThisChunk} ` +
      `pending=[${pendingPanelIndexes.join(",")}] total=${Date.now() - buildStart}ms`
  );

  return { comic, complete, pendingPanelIndexes, generatedThisChunk };
}

/**
 * The canonical cast for a story: prefer story.characters (the person1/person2
 * names matched to players), falling back to the distinct characters that
 * appear across the scripted panels.
 */
function resolveStoryCast(
  story: Story,
  scripted: Omit<StoryPanel, "imageUrl">[]
): ComicCharacter[] {
  const byId = new Map<string, ComicCharacter>();
  for (const c of story.characters ?? []) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  if (byId.size === 0) {
    for (const panel of scripted) {
      for (const c of panel.characters) {
        if (!byId.has(c.id)) byId.set(c.id, c);
      }
    }
  }
  return [...byId.values()];
}
