import type { Prompt } from "./prompts";
import {
  pickRandomPresetAnswer,
  pickRandomPresetAnswers,
} from "./preset-stories";

/** Extra players added (beyond the host) to reach 3 in a sample game. */
export const SAMPLE_PLAYER_NAMES = ["Sam", "Jordan", "Riley", "Casey"];

/**
 * Choose a funny/rude preset answer for a prompt from the famous-names story
 * library. Falls back to a short placeholder if a prompt id is unknown.
 */
export function pickSampleAnswer(prompt: Prompt, templateId = "classic"): string {
  return (
    pickRandomPresetAnswer(templateId, prompt.id) ??
    (prompt.type === "name" ? "A Mysterious Celebrity" : "something deeply unwise")
  );
}

/**
 * Build full submissions for each player. Each player gets a complete random
 * preset story for the active template (funny → filthy famous-name scenarios).
 */
export function buildSampleSubmissions(
  prompts: Prompt[],
  playerIds: string[],
  templateId = "classic"
): Record<string, Record<string, string>> {
  const submissions: Record<string, Record<string, string>> = {};
  for (const playerId of playerIds) {
    const fromPreset = pickRandomPresetAnswers(templateId);
    const answers: Record<string, string> = {};
    for (const prompt of prompts) {
      answers[prompt.id] =
        fromPreset[prompt.id] ?? pickSampleAnswer(prompt, templateId);
    }
    submissions[playerId] = answers;
  }
  return submissions;
}
