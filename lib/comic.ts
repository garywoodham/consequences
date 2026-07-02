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
 * Ask a vision LLM to describe the caricature so we can embed a textual
 * fingerprint of the character alongside the reference image in panel prompts.
 * Cheap gpt-4o-mini call; returns "" on any failure.
 */
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
          {
            role: "system",
            content:
              "You describe cartoon character illustrations concisely for an artist so " +
              "they can reproduce the same character. Reply with ONE short comma-separated " +
              "list of distinctive visual features only (hair color/style, eye color, skin " +
              "tone, facial hair, glasses, notable clothing). Max 20 words. No preamble.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Distinctive features of this character:" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 80,
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

/** Text-to-image fallback when no character reference photos are available. */
async function generatePanelFromText(scene: string, characters: ComicCharacter[]): Promise<string | null> {
  const cast = characters.length
    ? ` The named characters (${characters
        .map((c) => c.name)
        .join(", ")}) must all appear in the panel doing exactly what the caption says; do not swap or omit them.`
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
        prompt: `${NO_TEXT}\n\n${scene}${cast}\n\n${NO_TEXT}`,
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

type CastRef = {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
};

/**
 * Generate a single comic panel using an ORDERED, LABELLED cast sheet as the
 * one and only reference image. The image model sees each named character
 * exactly once (numbered 1..N with the name printed under each caricature) and
 * the prompt references those numbered slots explicitly. This is much more
 * reliable at preserving identity than passing several separate references.
 */
async function generatePanelImage(
  caption: string,
  characters: ComicCharacter[],
  descriptions: Map<string, string>,
  caricatures: Map<string, string | null>
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  // Split the panel's characters into two buckets:
  //   • castRefs   — have a reference image (uploaded photo → caricature)
  //   • extraNames — mentioned in the caption but no photo attached
  // Both must appear in the drawn panel, but only castRefs constrain likeness.
  const castRefs: CastRef[] = [];
  const extraNames: string[] = [];
  for (const c of characters) {
    const caricature = caricatures.get(c.id) ?? c.imageUrl;
    if (caricature) {
      castRefs.push({
        id: c.id,
        name: c.name,
        imageUrl: caricature,
        description: descriptions.get(c.id) ?? "",
      });
    } else {
      extraNames.push(c.name);
    }
  }

  const allNames = [...castRefs.map((r) => r.name), ...extraNames];
  const emphaticList = allNames.length
    ? allNames.map((n) => `**${n}**`).join(", ")
    : "the characters described";

  // No reference images at all — fall back to text-to-image but still list
  // every required character name in the prompt.
  if (castRefs.length === 0) {
    return generatePanelFromText(buildSceneDescription(caption, characters), characters);
  }

  const castSheetBuf = await buildCastSheet(
    castRefs.map((r) => ({ name: r.name, imageUrl: r.imageUrl }))
  );
  if (!castSheetBuf) {
    return generatePanelFromText(buildSceneDescription(caption, characters), characters);
  }

  const castSheetBlob = new Blob([new Uint8Array(castSheetBuf)], { type: "image/png" });

  const rosterLines = castRefs
    .map((r, i) => {
      const desc = r.description ? ` — ${r.description}` : "";
      return `  ${i + 1}. ${r.name} (tile #${i + 1} of the cast sheet, labelled "${r.name.toUpperCase()}")${desc}`;
    })
    .join("\n");

  const extrasNote = extraNames.length
    ? `\n\nADDITIONAL NAMED CHARACTERS (no reference image — draw them as ` +
      `plausible cartoon characters and reuse the same look for them across ` +
      `all panels): ${extraNames.join(", ")}.`
    : "";

  const prompt =
    `${NO_TEXT}\n\n` +
    `TASK: draw ONE brand-new comic panel illustrating the story caption below.\n\n` +
    `CAST SHEET (attached reference image): a labelled roster showing the ` +
    `characters that have a reference photo in this game. Each is a numbered ` +
    `tile with their name printed beneath. Roster:\n${rosterLines}${extrasNote}\n\n` +
    `IDENTITY RULES (highest priority):\n` +
    `  • For every roster character, copy their distinctive features EXACTLY ` +
    `from their tile (hair, face, skin tone, glasses, facial hair, notable ` +
    `clothing). They must be instantly recognisable as themselves.\n` +
    `  • Do NOT invent new characters in place of a roster character, do NOT ` +
    `swap features between people, do NOT replace anyone with a random person.\n` +
    `  • Every named character listed here MUST appear in the panel: ${emphaticList}.\n` +
    `  • If the panel cannot comfortably fit everyone at close-up scale, use ` +
    `a wider composition — never omit any of ${allNames.join(", ") || "the characters"}.\n\n` +
    `SCENE: ${caption}\n\n` +
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

  return generatePanelFromText(buildSceneDescription(caption, characters), characters);
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

  // Caricature each unique player photo once, and ask a vision LLM to
  // describe the caricature so we have both a visual AND textual fingerprint
  // of every character to anchor identity across panels.
  const caricatureCache = new Map<string, string | null>();
  const descriptionCache = new Map<string, string>();
  const uniqueAvatars = new Map<string, string>();
  for (const panel of scripted) {
    for (const c of panel.characters) {
      if (c.imageUrl && !uniqueAvatars.has(c.id)) {
        uniqueAvatars.set(c.id, c.imageUrl);
      }
    }
  }
  await Promise.all(
    [...uniqueAvatars.entries()].map(async ([id, url]) => {
      const caricature = await generateCaricature(url);
      caricatureCache.set(id, caricature);
      if (caricature) {
        descriptionCache.set(id, await describeCaricature(caricature));
      }
    })
  );

  const panels: StoryPanel[] = await Promise.all(
    scripted.map(async (panel, i) => {
      const characters = panel.characters.map((c) => ({
        ...c,
        imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
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
  return { mode: anyImages ? "ai" : "photo", panels };
}
