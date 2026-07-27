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
    const person1 = nameTexts[0] ? capitalizeFirst(nameTexts[0]) : undefined;
    let person2 = nameTexts[1] ? capitalizeFirst(nameTexts[1]) : undefined;

    // In multiplayer, different players independently fill the name prompts
    // (and the name-picker nudges them toward real players), so the two leads
    // can collide on the same name — producing a degenerate "Alice and Alice"
    // story with a single character. When that happens, swap the second lead
    // for a distinct name drawn from the game's pool of names.
    if (person1 && person2 && person1.toLowerCase() === person2.toLowerCase()) {
      const alt = pickDistinctName(person1, activePlayers, submissions, template);
      if (alt) person2 = alt;
    }

    const names: NameValues = { person1, person2 };

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

    const characters = buildStoryCharacters(names, activePlayers, lines);

    return {
      id: `story-${storyIndex + 1}`,
      lines,
      prose: buildProse(lines),
      characters,
    };
  });
}

/**
 * Find a lead name distinct from `avoid`, drawn from the game's pool of names:
 * every player's name-prompt answers first, then the player names themselves.
 * Returns undefined if no distinct candidate exists (e.g. solo play).
 */
function pickDistinctName(
  avoid: string,
  players: Player[],
  submissions: Record<string, Record<string, string>>,
  template: ReturnType<typeof getTemplateById>
): string | undefined {
  const avoidKey = avoid.trim().toLowerCase();
  const namePromptIds = template.prompts.filter((p) => p.type === "name").map((p) => p.id);

  const candidates: string[] = [];
  for (const p of players) {
    for (const promptId of namePromptIds) {
      const answer = submissions[p.id]?.[promptId];
      if (answer) candidates.push(answer);
    }
  }
  for (const p of players) candidates.push(p.name);

  for (const raw of candidates) {
    const name = capitalizeFirst(raw.trim());
    if (name && name.toLowerCase() !== avoidKey) return name;
  }
  return undefined;
}

/** Whole-word, case-insensitive, Unicode-aware name mention check. */
function nameMentioned(haystack: string, name: string): boolean {
  const needle = name.trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu").test(haystack);
}

/**
 * Resolve the characters that appear in a story into `ComicCharacter` entries
 * carrying their photo when a name matches a player in the game
 * (case-insensitive whole-name match). This is what the comic generator needs
 * so every image actually shows the right people.
 *
 * The two leads (person1/person2 from the name prompts) always come first.
 * In multiplayer a mixed story often also mentions OTHER players by name — so
 * we additionally anchor any player whose name appears anywhere in the story
 * text. Without this, only the two leads had photos and every other named
 * person was drawn as a random invented face, which is what made multiplayer
 * comics feel muddled.
 */
function buildStoryCharacters(
  names: NameValues,
  players: Player[],
  lines: StoryLine[]
): ComicCharacter[] {
  const seen = new Set<string>();
  const characters: ComicCharacter[] = [];

  const addByName = (rawName: string | undefined) => {
    if (!rawName) return;
    const name = rawName.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const match = players.find((p) => p.name.trim().toLowerCase() === key);
    characters.push({
      id: match?.id ?? `character-${key}`,
      name,
      imageUrl: match?.avatarUrl,
    });
  };

  // Leads first, in story order.
  addByName(names.person1);
  addByName(names.person2);

  // Then any other player referenced by name anywhere in the story text.
  const haystack = lines.map((l) => `${l.display} ${l.text}`).join(" ");
  for (const p of players) {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (nameMentioned(haystack, p.name)) {
      seen.add(key);
      characters.push({ id: p.id, name: p.name.trim(), imageUrl: p.avatarUrl });
    }
  }

  return characters;
}
