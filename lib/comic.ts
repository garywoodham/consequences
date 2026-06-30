// Server-only module: reads OPENAI_API_KEY and calls external image APIs.
import type { ComicCharacter, ComicStripData, Story, StoryLine, StoryPanel } from "./types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CARICATURE_STYLE =
  "bold-outlined cartoon caricature, exaggerated friendly features, flat vibrant colors, " +
  "clean white background, character reference sheet style";
const PANEL_STYLE =
  "fun comic book panel, bold ink outlines, halftone shading, vibrant flat colors, " +
  "expressive cartoon characters, dynamic composition";

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

    const sceneDescription =
      `${PANEL_STYLE}. Scene ${index + 1}: ${caption}` +
      (characters.length
        ? `. Featuring ${characters.map((c) => c.name).join(" and ")}.`
        : "");

    return { index, caption, sceneDescription, characters };
  });
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

/** Generate a single comic panel illustration (OpenAI image generation). */
async function generatePanelImage(scene: string, characters: ComicCharacter[]): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const cast = characters.length
    ? ` The recurring characters are: ${characters.map((c) => c.name).join(", ")}.`
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
        prompt: `${scene}${cast}`,
        size: "1024x1024",
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
    scripted.map(async (panel) => {
      const characters = panel.characters.map((c) => ({
        ...c,
        imageUrl: caricatureCache.get(c.id) ?? c.imageUrl,
      }));
      const imageUrl = await generatePanelImage(panel.sceneDescription, characters);
      return { ...panel, characters, imageUrl: imageUrl ?? undefined };
    })
  );

  // If image generation failed across the board, present as a photo strip.
  const anyImages = panels.some((p) => p.imageUrl);
  return { mode: anyImages ? "ai" : "photo", panels };
}
