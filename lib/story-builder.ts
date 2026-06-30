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

function buildProse(lines: StoryLine[], templateId: string): string {
  const template = getTemplateById(templateId);
  const parts: string[] = [];

  for (let i = 0; i < template.prompts.length; i++) {
    const prompt = template.prompts[i];
    const line = lines.find((l) => l.promptId === prompt.id);
    if (!line) continue;

    const formatted = formatLine(line.text, prompt.prefix);

    if (i === 0) {
      parts.push(formatted);
    } else if (i === 1) {
      parts.push(formatted);
    } else if (prompt.prefix && ["met", "at", "to"].includes(prompt.prefix.toLowerCase())) {
      parts.push(formatted);
    } else if (prompt.prefix) {
      parts.push(formatted + ".");
    } else {
      parts.push(capitalizeFirst(line.text) + ".");
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").replace(/\.\./g, ".").trim();
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
        text,
        playerId: player.id,
        playerName: player.name,
      };
    });

    return {
      id: `story-${storyIndex + 1}`,
      lines,
      prose: buildProse(lines, templateId),
    };
  });
}
