// Server-only module: reads OPENAI_API_KEY and calls external image APIs.
import type { ComicCharacter, ComicStripData, Story, StoryLine, StoryPanel } from "./types";
import { sanitizeCaptionsForImage } from "./safe-rewrite";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARICATURE_STYLE =
  "bold-outlined cartoon caricature, exaggerated friendly features, flat vibrant colors, " +
  "clean white background, character reference sheet style";
const PANEL_STYLE =
  "fun comic book panel, bold ink outlines, halftone shading, vibrant flat colors, " +
  "expressive cartoon characters, dynamic composition";
// The readable caption is shown beneath each panel in the UI, so the artwork
// itself must contain no lettering.
const NO_TEXT =
  "Important: the image must contain NO text of any kind — no words, letters, " +
  "captions, titles, speech bubbles, thought bubbles, signs, or writing.";

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

  return groups.map((group, index) => {
    const caption = group
      .map((l) => l.display)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const characters: ComicCharacter[] = [];
    for (const line of group) {
      if (!characters.some((c) => c.id === line.playerId)) {
        characters.push({
          id: line.playerId,
          name: line.playerName,
          imageUrl: line.playerAvatarUrl,
        });
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
    // Least-restrictive filtering — suits an adults-only party game (still
    // blocks the hard-disallowed categories).
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
        prompt: `${scene}${cast} ${NO_TEXT}`,
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
 * Generate a single comic panel. When the characters have reference images
 * (their caricature, derived from the uploaded photo) those images are passed
 * to the image-edit endpoint so the drawn characters resemble the real players.
 */
async function generatePanelImage(scene: string, characters: ComicCharacter[]): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const named = characters.filter((c) => c.imageUrl);
  const refs = (
    await Promise.all(named.map((c) => fetchAsBlob(c.imageUrl as string)))
  ).map((blob, i) => ({ blob, name: named[i].name }));
  const usableRefs = refs.filter((r): r is { blob: Blob; name: string } => Boolean(r.blob));

  // No uploaded photos for this panel's cast → plain text-to-image.
  if (usableRefs.length === 0) {
    return generatePanelFromText(scene, characters);
  }

  const castNames = usableRefs.map((r) => r.name).join(", ");
  const refLegend = usableRefs
    .map((r, i) => `Reference image ${i + 1} shows ${r.name}.`)
    .join(" ");

  try {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    usableRefs.forEach((r, i) => form.append("image[]", r.blob, `character-${i}.png`));
    form.append(
      "prompt",
      `${scene} ` +
        `Compose a brand-new full comic panel that depicts the scene, setting and action ` +
        `described above — this must be an illustrated story moment, NOT a portrait. ` +
        `${refLegend} Draw the named characters (${castNames}) so they clearly resemble their ` +
        `matching reference image, doing exactly what the caption says. Anyone named in the ` +
        `caption MUST appear in the panel and must be the same person as their reference. ` +
        `Do not swap, merge or omit characters. Do not simply reproduce, crop, or restyle the ` +
        `reference image. ${NO_TEXT}`
    );
    form.append("size", "1024x1024");
    form.append("quality", "low");
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

  return generatePanelFromText(scene, characters);
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

  // Caricature each unique player photo once, reuse across panels.
  const caricatureCache = new Map<string, string | null>();
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
      caricatureCache.set(id, await generateCaricature(url));
    })
  );

  const panels: StoryPanel[] = await Promise.all(
    scripted.map(async (panel, i) => {
      const characters = panel.characters.map((c) => ({
        ...c,
        imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
      }));
      const safeCaption = safeCaptions[i] ?? panel.caption;
      const imageScene = buildSceneDescription(safeCaption, characters);
      const imageUrl = await generatePanelImage(imageScene, characters);
      return { ...panel, characters, imageUrl: imageUrl ?? undefined };
    })
  );

  // If image generation failed across the board, present as a photo strip.
  const anyImages = panels.some((p) => p.imageUrl);
  return { mode: anyImages ? "ai" : "photo", panels };
}
