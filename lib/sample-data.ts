import type { Prompt } from "./prompts";

/** Extra players added (beyond the host) to reach 3 in a sample game. */
export const SAMPLE_PLAYER_NAMES = ["Sam", "Jordan", "Riley", "Casey"];

const NAMES = [
  "Beyoncé",
  "Gandalf the Beige",
  "Sir Reginald Picklesworth",
  "DJ Sparkle Toes",
  "Captain Mittens",
  "Aunt Brenda",
  "a very tall toddler",
  "Cleopatra",
  "Mr. Bumblebee",
  "the Burger King himself",
];

const PLACES = [
  "the abandoned ball pit",
  "a haunted IKEA",
  "the world's saddest bowling alley",
  "a llama farm at midnight",
  "the back of a kebab van",
  "an underwater disco",
  "the queue at the post office",
  "a trampoline park for adults",
];

const CLOTHING = [
  "a seafoam green leisure suit",
  "nothing but bubble wrap",
  "a full suit of armour",
  "novelty crocs and socks",
  "a wedding dress made of receipts",
  "an inflatable T-rex costume",
  "a single, very confident oven glove",
];

const QUOTES = [
  '"Is this legal?"',
  '"I left the oven on."',
  '"Nice shoes, wrong feet."',
  '"That\'s not what the goat told me."',
  '"I regret everything and nothing."',
  '"Has anyone seen my emotional support pigeon?"',
];

const ACTIONS = [
  "poured a martini with their feet",
  "challenged a seagull to a duel",
  "started aggressively interpretive dancing",
  "tried to sell the moon on eBay",
  "ate an entire wheel of brie",
  "alphabetised the spice rack",
  "did a backflip into a kiddie pool",
];

const ADJECTIVES = [
  "mildly suspicious",
  "aggressively cheerful",
  "transparent",
  "faintly damp",
  "unreasonably tall",
  "extremely lukewarm",
  "dangerously sparkly",
];

const OUTCOMES = [
  "the band finally got back together",
  "everyone got matching tattoos",
  "the council sent a strongly-worded letter",
  "they became minor TikTok celebrities",
  "the goat unionised",
  "it was declared a national holiday",
  "nobody spoke of it again",
];

function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Choose a plausibly funny answer for a prompt based on its label/type. */
export function pickSampleAnswer(prompt: Prompt): string {
  if (prompt.type === "name") return pick(NAMES);

  const hint = `${prompt.label} ${prompt.segment ?? ""}`.toLowerCase();

  if (hint.includes("adjective")) return pick(ADJECTIVES);
  if (hint.includes("wore") || hint.includes("wear")) return pick(CLOTHING);
  if (hint.includes("said") || hint.includes("say")) return pick(QUOTES);
  if (
    hint.includes("where") ||
    hint.includes("met") ||
    hint.includes("world") ||
    hint.includes("there")
  ) {
    return pick(PLACES);
  }
  if (
    hint.includes("consequence") ||
    hint.includes("result") ||
    hint.includes("happened") ||
    hint.includes("ended") ||
    hint.includes("learned")
  ) {
    return pick(OUTCOMES);
  }
  return pick(ACTIONS);
}

/** Build full random submissions (every prompt) for each player id. */
export function buildSampleSubmissions(
  prompts: Prompt[],
  playerIds: string[]
): Record<string, Record<string, string>> {
  const submissions: Record<string, Record<string, string>> = {};
  for (const playerId of playerIds) {
    const answers: Record<string, string> = {};
    for (const prompt of prompts) {
      answers[prompt.id] = pickSampleAnswer(prompt);
    }
    submissions[playerId] = answers;
  }
  return submissions;
}
