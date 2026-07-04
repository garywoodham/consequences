// Server-only module: reads OPENAI_API_KEY and calls external image APIs.
import type { ComicCharacter, ComicStripData, Story, StoryLine, StoryPanel } from "./types";
import { sanitizeCaptionsForImage, type SanitizeLevel } from "./safe-rewrite";
import { buildCastSheet } from "./cast-sheet";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARICATURE_STYLE =
  "bold-outlined cartoon caricature with all distinctive facial features clearly " +
  "preserved (hair color and style, eye color, skin tone, glasses, facial hair, " +
  "notable clothing) — exaggerated but instantly recognisable, flat vibrant colors, " +
  "clean white background, character reference sheet style";
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

    // ALWAYS include every named story character in every panel, so each
    // character's description is passed to the image model for all panels
    // (keeps the whole cast consistent, never dropping anyone). Only legacy
    // stories with no resolved cast fall back to the panel's line authors.
    let characters: ComicCharacter[];
    if (storyCast.length > 0) {
      characters = storyCast;
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
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu").test(text);
}

function buildSceneDescription(caption: string, characters: ComicCharacter[]): string {
  return (
    `Illustrate this story moment: ${caption}` +
    (characters.length
      ? ` Featuring ${characters.map((c) => c.name).join(" and ")}.`
      : "") +
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

/** Turn an uploaded photo into a cartoon caricature (OpenAI image edit). */
export async function generateCaricature(imageUrl: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const blob = await fetchAsBlob(imageUrl);
  if (!blob) return null;

  try {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image", blob, "photo.png");
    form.append(
      "prompt",
      `Transform this person into a ${CARICATURE_STYLE}. Keep them recognizable.`
    );
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

async function describeCaricature(dataUrl: string): Promise<string> {
  if (!OPENAI_API_KEY || !dataUrl.startsWith("data:image")) return "";
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
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
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
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "giu"), "");
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
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "giu"), label);
}

type PanelCharacter = {
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
      return `  • ${pc.label}${tile}: ${features}.`;
    })
    .join("\n");
}

/**
 * Text-to-image fallback (no reference photos). Characters are still described
 * by features + neutral labels so we get consistent lookalikes, not real people.
 */
type PanelResult = { imageUrl: string | null; prompt: string };

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
  const prompt =
    `${NO_TEXT}\n\n${guideBlock}SCENE: ${scene}\n\n` +
    `STYLE: ${PANEL_STYLE}.\n\n${NO_TEXT}`;

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
    if (!res.ok) return { imageUrl: null, prompt };
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    return { imageUrl: b64 ? `data:image/png;base64,${b64}` : null, prompt };
  } catch {
    return { imageUrl: null, prompt };
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
  caricatures: Map<string, string | null>
): Promise<PanelResult> {
  if (!OPENAI_API_KEY) return { imageUrl: null, prompt: "" };

  const { cast, sceneCaptionRewriter } = buildPanelCast(
    characters,
    descriptions,
    caricatures
  );
  const sceneWithLabels = sceneCaptionRewriter(caption);
  const withRefs = cast.filter((c) => c.image);

  // No reference images at all → text-to-image using feature descriptions.
  if (withRefs.length === 0) {
    return generatePanelFromTextCast(sceneWithLabels, cast);
  }

  const castSheetBuf = await buildCastSheet(
    withRefs.map((c) => ({ name: c.label, imageUrl: c.image as string }))
  );
  if (!castSheetBuf) {
    return generatePanelFromTextCast(sceneWithLabels, cast);
  }

  const castSheetBlob = new Blob([new Uint8Array(castSheetBuf)], { type: "image/png" });
  const guide = buildCharacterGuide(cast, true);
  const labelList = cast.map((c) => c.label).join(", ");
  const scene = ensureAllPresent(sceneWithLabels, cast);

  const prompt =
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
    `${NO_TEXT}`;

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
    }
  } catch {
    // fall through to text generation below
  }

  // Fall back to text-to-image, but keep the richer cast-sheet prompt as the
  // record of what we asked for (it's the more descriptive instruction).
  const fallback = await generatePanelFromTextCast(sceneWithLabels, cast);
  return { imageUrl: fallback.imageUrl, prompt: fallback.imageUrl ? fallback.prompt : prompt };
}

/**
 * Build a comic strip from a finished story. When an image provider is
 * configured each player photo is caricatured and every panel is illustrated;
 * otherwise it falls back to a photo-based strip rendered on the client.
 */
export async function buildComic(story: Story): Promise<ComicStripData> {
  const scripted = scriptPanels(story);

  if (!hasAiProvider()) {
    return {
      mode: "photo",
      panels: scripted.map((p) => ({ ...p })),
    };
  }

  // STEP 1 — up front, lock in every named character's identity: caricature
  // each unique player photo once and generate a detailed feature description
  // from it. Descriptions are keyed by character id (which maps 1:1 to the
  // story name) and reused verbatim in every panel so the look stays
  // consistent. This is the single source of truth for how each person looks.
  const storyCast = resolveStoryCast(story, scripted);
  const caricatureCache = new Map<string, string | null>();
  const descriptionCache = new Map<string, string>();
  const descriptionSource = new Map<string, "photo" | "web">();

  await Promise.all(
    storyCast.map(async (c) => {
      if (c.imageUrl) {
        // Photo uploaded → caricature it and describe the caricature.
        const caricature = await generateCaricature(c.imageUrl as string);
        caricatureCache.set(c.id, caricature);
        if (caricature) {
          const desc = await describeCaricature(caricature);
          if (desc) {
            descriptionCache.set(c.id, desc);
            descriptionSource.set(c.id, "photo");
          }
        }
      } else {
        // No photo → search online for a matching public-figure description.
        const desc = await lookupPersonDescription(c.name);
        if (desc) {
          descriptionCache.set(c.id, desc);
          descriptionSource.set(c.id, "web");
        }
      }
    })
  );

  // The cast list returned to the client for review: name + the exact
  // description that will be handed to the image model (names are not).
  const cast: ComicCharacter[] = storyCast.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
    description: descriptionCache.get(c.id) ?? "",
    descriptionSource: descriptionSource.get(c.id),
  }));

  const panels: StoryPanel[] = await Promise.all(
    scripted.map(async (panel) => {
      const characters = panel.characters.map((c) => ({
        ...c,
        imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
        description: descriptionCache.get(c.id) ?? c.description ?? "",
      }));
      const names = panel.characters
        .filter((c) => mentionsName(panel.caption, c.name))
        .map((c) => c.name);

      // Push the crudest version FIRST: attempt the raw player caption
      // unchanged (only names→labels). gpt-image-1 at moderation:"low" allows
      // a lot of risqué content, and image moderation is somewhat
      // non-deterministic — so we try the raw text (twice, to ride out flaky
      // refusals) before softening anything. Only if the model still refuses
      // do we walk down the softening ladder (0 = surgical swap, 1 =
      // aftermath, 2 = whimsical), keeping the least-softened version that the
      // model actually accepts.
      let caption = panel.caption;
      let result = await generatePanelImage(
        caption,
        characters,
        descriptionCache,
        caricatureCache
      );
      if (!result.imageUrl) {
        result = await generatePanelImage(
          caption,
          characters,
          descriptionCache,
          caricatureCache
        );
      }

      const levels: SanitizeLevel[] = [0, 1, 2];
      for (const level of levels) {
        if (result.imageUrl) break;
        const [softer] = await sanitizeCaptionsForImage(
          [{ caption: panel.caption, names }],
          level
        );
        if (!softer || softer === caption) continue;
        caption = softer;
        result = await generatePanelImage(
          caption,
          characters,
          descriptionCache,
          caricatureCache
        );
      }

      return {
        ...panel,
        characters,
        imageUrl: result.imageUrl ?? undefined,
        imagePrompt: result.prompt || undefined,
      };
    })
  );

  // If image generation failed across the board, present as a photo strip.
  const anyImages = panels.some((p) => p.imageUrl);
  return { mode: anyImages ? "ai" : "photo", panels, cast };
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
