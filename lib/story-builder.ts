import { getTemplateById } from "./prompts";
import type { ComicCharacter, Player, Story, StoryLine } from "./types";

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type NameValues = { person1?: string; person2?: string };

/** Render a prompt's answer into its story segment, filling in name placeholders. */
function renderSegment(segment: string, answer: string, names: NameValues): string {
  return segment
    .replace(/\{answer\}/g, answer.trim())
    .replace(/\{person1\}/g, names.person1 ?? "they")
    .replace(/\{person2\}/g, names.person2 ?? "they")
    .replace(/\s+/g, " ")
    .trim();
}

/** Join rendered segments into a single, readable paragraph. */
function buildProse(lines: StoryLine[]): string {
  const joined = lines
    .map((line) => line.display)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1") // no space before punctuation
    .replace(/([.!?])\1+/g, "$1") // collapse repeated terminators (".." -> ".")
    .replace(/([”"'’])\./g, "$1") // drop a stray period right after a closing quote
    .replace(/\.\s*\./g, ".")
    .trim();
  return capitalizeFirst(joined);
}

function pickPlayerOrder(players: Player[], storyIndex: number): Player[] {
  const rotated = [...players];
  for (let i = 0; i < storyIndex % players.length; i++) {
    const first = rotated.shift();
    if (first) rotated.push(first);
  }
  return shuffle(rotated);
}

export function buildMixedStories(
  players: Player[],
  submissions: Record<string, Record<string, string>>,
  templateId: string
): Story[] {
  const template = getTemplateById(templateId);
  const activePlayers = players.filter((p) => submissions[p.id]);
  if (activePlayers.length === 0) return [];

  const storyCount = Math.min(activePlayers.length, 10);

  return Array.from({ length: storyCount }, (_, storyIndex) => {
    const playerOrder = pickPlayerOrder(activePlayers, storyIndex);

    // First pass: assign a contributing player (and their answer) to each prompt.
    const assigned = template.prompts.map((prompt, promptIndex) => {
      const player = playerOrder[promptIndex % playerOrder.length];
      const rawText = submissions[player.id]?.[prompt.id] ?? "...";
      const text = prompt.type === "name" ? capitalizeFirst(rawText.trim()) : rawText;
      return { prompt, player, text };
    });

    // Resolve the two character names from the name prompts (in order).
    const nameTexts = assigned.filter((a) => a.prompt.type === "name").map((a) => a.text);
    const names: NameValues = {
      person1: nameTexts[0] ? capitalizeFirst(nameTexts[0]) : undefined,
      person2: nameTexts[1] ? capitalizeFirst(nameTexts[1]) : undefined,
    };

    // Second pass: render each segment, substituting names where needed.
    const lines: StoryLine[] = assigned.map(({ prompt, player, text }) => ({
      promptId: prompt.id,
      promptLabel: prompt.label,
      text,
      display: renderSegment(prompt.segment ?? "{answer}", text, names),
      playerId: player.id,
      playerName: player.name,
      playerAvatarUrl: player.avatarUrl,
    }));

    const characters = buildStoryCharacters(names, activePlayers);

    return {
      id: `story-${storyIndex + 1}`,
      lines,
      prose: buildProse(lines),
      characters,
    };
  });
}

/**
 * Resolve the character names that appear in the story (person1/person2) into
 * `ComicCharacter` entries carrying their photo when a name matches a player
 * in the game (case-insensitive whole-name match). This is what the comic
 * generator needs so every image actually shows the right people.
 */
function buildStoryCharacters(
  names: NameValues,
  players: Player[]
): ComicCharacter[] {
  const uniqueNames = [names.person1, names.person2].filter(
    (n): n is string => Boolean(n && n.trim())
  );
  const seen = new Set<string>();
  const characters: ComicCharacter[] = [];
  for (const rawName of uniqueNames) {
    const name = rawName.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const match = players.find((p) => p.name.trim().toLowerCase() === key);
    characters.push({
      id: match?.id ?? `character-${key}`,
      name,
      imageUrl: match?.avatarUrl,
    });
  }
  return characters;
}
