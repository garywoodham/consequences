import { getTemplateById } from "./prompts";
import type { Player, Story, StoryLine } from "./types";

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

function formatLine(text: string, prefix?: string): string {
  const trimmed = text.trim();
  if (!prefix) return capitalizeFirst(trimmed);

  const lowerPrefix = prefix.toLowerCase();
  if (lowerPrefix === "met" || lowerPrefix === "at" || lowerPrefix === "to") {
    return `${prefix} ${trimmed}`;
  }

  return `${prefix} ${trimmed.charAt(0).toLowerCase() + trimmed.slice(1)}`;
}

const CONNECTOR_PREFIXES = ["met", "at", "to"];

/** Format a single segment as it appears within the flowing story. */
function buildSegment(text: string, prefix: string | undefined, index: number): string {
  const formatted = formatLine(text, prefix);

  if (index <= 1) {
    return formatted;
  }
  if (prefix && CONNECTOR_PREFIXES.includes(prefix.toLowerCase())) {
    return formatted;
  }
  if (prefix) {
    return formatted + ".";
  }
  return capitalizeFirst(text.trim()) + ".";
}

function buildProse(lines: StoryLine[]): string {
  return lines
    .map((line) => line.display)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\.\./g, ".")
    .trim();
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
    const lines: StoryLine[] = template.prompts.map((prompt, promptIndex) => {
      const player = playerOrder[promptIndex % playerOrder.length];
      const text = submissions[player.id]?.[prompt.id] ?? "...";
      return {
        promptId: prompt.id,
        promptLabel: prompt.label,
        text,
        display: buildSegment(text, prompt.prefix, promptIndex),
        playerId: player.id,
        playerName: player.name,
        playerAvatarUrl: player.avatarUrl,
      };
    });

    return {
      id: `story-${storyIndex + 1}`,
      lines,
      prose: buildProse(lines),
    };
  });
}
