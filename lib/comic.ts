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

    // Character list = story characters mentioned by name in this panel's
    // caption. If none is mentioned (the panel is pure narration) fall back
    // to the full story cast so the image still shows the right people.
    const mentioned = storyCast.filter((c) => mentionsName(caption, c.name));
    const characters: ComicCharacter[] =
      mentioned.length > 0 ? mentioned : storyCast;

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
async function generatePanelFromTextCast(
  sceneWithLabels: string,
  cast: PanelCharacter[]
): Promise<string | null> {
  const guide = cast.length ? buildCharacterGuide(cast, false) : "";
  const labelList = cast.map((c) => c.label).join(", ");
  const guideBlock = guide
    ? `${FICTIONAL_NOTE}\n\nCHARACTER GUIDE:\n${guide}\n\n` +
      `All of these characters (${labelList}) must appear in the panel doing ` +
      `exactly what the scene says; do not swap or omit anyone.\n\n`
    : "";

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt:
          `${NO_TEXT}\n\n${guideBlock}SCENE: ${sceneWithLabels}\n\n` +
          `STYLE: ${PANEL_STYLE}.\n\n${NO_TEXT}`,
        size: "1024x1024",
        quality: "low",
        moderation: "low",
        n: 1,
      }),
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
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

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
    `  • Every character listed MUST appear in the panel: ${labelList}.\n` +
    `  • Prefer a wider composition over leaving anyone out.\n\n` +
    `SCENE: ${sceneWithLabels}\n\n` +
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
      if (b64) return `data:image/png;base64,${b64}`;
    }
  } catch {
    // fall through to text generation below
  }

  return generatePanelFromTextCast(sceneWithLabels, cast);
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

  // Sanitise per-panel captions for the image model in one batched call.
  // The original captions are kept for display below the panels; character
  // names are preserved so the image model still draws the right people.
  const safeCaptions = await sanitizeCaptionsForImage(
    scripted.map((p) => ({
      caption: p.caption,
      names: p.characters.map((c) => c.name),
    }))
  );

  // STEP 1 — up front, lock in every named character's identity: caricature
  // each unique player photo once and generate a detailed feature description
  // from it. Descriptions are keyed by character id (which maps 1:1 to the
  // story name) and reused verbatim in every panel so the look stays
  // consistent. This is the single source of truth for how each person looks.
  const storyCast = resolveStoryCast(story, scripted);
  const caricatureCache = new Map<string, string | null>();
  const descriptionCache = new Map<string, string>();

  await Promise.all(
    storyCast
      .filter((c) => c.imageUrl)
      .map(async (c) => {
        const caricature = await generateCaricature(c.imageUrl as string);
        caricatureCache.set(c.id, caricature);
        if (caricature) {
          descriptionCache.set(c.id, await describeCaricature(caricature));
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
  }));

  const panels: StoryPanel[] = await Promise.all(
    scripted.map(async (panel, i) => {
      const characters = panel.characters.map((c) => ({
        ...c,
        imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
        description: descriptionCache.get(c.id) ?? c.description ?? "",
      }));
      const names = panel.characters.map((c) => c.name);
      let caption = safeCaptions[i] ?? panel.caption;

      // Try level 0; if the image model refuses, escalate to level 1 then 2.
      let imageUrl = await generatePanelImage(
        caption,
        characters,
        descriptionCache,
        caricatureCache
      );

      const levels: SanitizeLevel[] = [1, 2];
      for (const level of levels) {
        if (imageUrl) break;
        const [escalated] = await sanitizeCaptionsForImage(
          [{ caption: panel.caption, names }],
          level
        );
        if (!escalated || escalated === caption) continue;
        caption = escalated;
        imageUrl = await generatePanelImage(
          caption,
          characters,
          descriptionCache,
          caricatureCache
        );
      }

      return { ...panel, characters, imageUrl: imageUrl ?? undefined };
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
