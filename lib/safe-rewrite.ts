// Server-only: rewrites edgy story moments into image-safe workarounds so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Escalation ladder for the sanitiser. Start mild; only go harder on refusal. */
export type SanitizeLevel = 0 | 1 | 2;

const BASE_RULES =
  "ABSOLUTE RULES:\n" +
  "1. Every character name provided for an item MUST appear in that item's " +
  "rewrite spelled EXACTLY as given, in the same role/position it had in the " +
  "original caption. Do not replace names with pronouns, roles ('the man'), " +
  "or different names, and do not swap who is doing what.\n" +
  "2. Preserve every setting and story beat, and the humour.\n" +
  "3. Roughly the same length as the input, one caption per input.\n" +
  "4. No moralising, apologies or explanations.\n";

const LEVEL_INSTRUCTIONS: Record<SanitizeLevel, string> = {
  0:
    "You are the image-safety pass for an ADULT party game. The story is " +
    "crude and cheeky and readers see the raw caption; you are only adjusting " +
    "what the image model sees. DO NOT turn adult humour into a children's " +
    "cartoon. If the caption is already image-safe, return it UNCHANGED.\n\n" +
    "TECHNIQUE — IMPLY THROUGH AFTERMATH & CONTEXT.\n" +
    "The reliable way to pass image safety is to describe the AFTERMATH, " +
    "MOOD, or SURROUNDING CONTEXT that makes it OBVIOUS what happened — " +
    "without showing the act itself. Keep it adult. Do not depict the " +
    "moment of sex, nudity, drug use, or graphic violence directly.\n\n" +
    "Examples of the RIGHT level of softening (aftermath / context style):\n" +
    "  • 'Alice and Bob had sex' → 'Alice and Bob lying in bed together " +
    "afterwards, tangled in the sheets, both sweating and looking blissfully " +
    "satisfied, clothes strewn on the floor'\n" +
    "  • 'Bob got completely naked' → 'Bob standing beside a heap of his " +
    "own discarded clothes, holding a strategically placed potted plant in " +
    "front of himself, bare shoulders and legs visible'\n" +
    "  • 'Kim gave Sara oral sex' → 'Sara sitting on the sofa with a rapturous " +
    "expression, biting her lip, Kim just visible below the frame, only the " +
    "top of Kim's head showing above Sara's lap'\n" +
    "  • 'Dave shot Kim with a rifle' → 'Kim collapsed dramatically on the " +
    "ground with cartoon X-eyes and comic-book stars circling, Dave standing " +
    "over her clutching a smoking cartoon rifle, wisps of smoke curling off'\n" +
    "  • 'Sara did lines of cocaine' → 'Sara wild-eyed with spiral pupils and " +
    "a manic grin, dust of glittery white powder on her nose, an empty mirror " +
    "and rolled-up note on the table'\n" +
    "  • 'They got smashed on tequila' → 'Alice and Bob slumped against each " +
    "other on a stool, cheeks flushed, empty shot glasses stacked in a tower " +
    "in front of them'\n" +
    "\n" +
    "Rule of thumb: SHOW WHAT HAPPENED BEFORE OR AFTER, not the act itself. " +
    "Use body language, expressions, environment and props to make the " +
    "outcome unmistakable.",
  1:
    "STRONGER RETRY. Your last attempt was still refused by the image " +
    "model. Push the aftermath/context technique further — remove any " +
    "residual reference to the explicit act itself and rely entirely on " +
    "visible clues.\n\n" +
    "Examples:\n" +
    "  • 'Alice and Bob had sex' → 'Alice and Bob sitting on the edge of a " +
    "rumpled bed side by side, both wrapped in a single duvet, hair " +
    "dishevelled, sharing a knowing satisfied smile'\n" +
    "  • 'Bob got naked' → 'Bob in a skin-toned bodysuit with his entire " +
    "body slightly blurred to imply he is naked, everyone around him " +
    "reacting with shocked exaggerated expressions'\n" +
    "  • 'Dave shot Kim' → 'Kim theatrically fainting backwards with " +
    "cartoon X-eyes, Dave in a slapstick pose holding a comic-book pop-gun " +
    "with a small \"BANG\" flag popping out (no letters/writing on flag)'\n" +
    "  • 'Sara did cocaine' → 'Sara wild-eyed and buzzing with cartoon " +
    "jitter-lines around her head, empty mirror on the table'\n" +
    "\n" +
    "Every required name MUST still appear verbatim.",
  2:
    "LAST RETRY. Both previous attempts were rejected. Fall back to a very " +
    "gentle whimsical cartoon depiction of the same story beat that at " +
    "least gestures at the original vibe. Every required name MUST still " +
    "appear verbatim.",
};

function systemPrompt(level: SanitizeLevel, retryDueToNameDrop = false): string {
  const nameNote = retryDueToNameDrop
    ? "\nCRITICAL: your previous rewrite dropped or altered one or more " +
      "required names. Every listed name MUST appear verbatim, doing what " +
      "the caption says.\n"
    : "";
  return (
    LEVEL_INSTRUCTIONS[level] +
    nameNote +
    "\n\n" +
    BASE_RULES +
    '\nReturn JSON with the exact shape: {"captions": ["...", "..."]} ' +
    "with the same number of items as the input array, in the same order."
  );
}

export function hasSafeRewriteProvider(): boolean {
  return Boolean(OPENAI_API_KEY);
}

export type SafeRewriteItem = { caption: string; names: string[] };

/** All required names appear (case-insensitively) as whole-word matches. */
function preservesNames(rewrite: string, names: string[]): boolean {
  return names.every((n) => {
    const needle = n.trim();
    if (!needle) return true;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu");
    return re.test(rewrite);
  });
}

/**
 * Last-resort safe caption if every LLM attempt fails. Names always present.
 */
function synthesizeFallback(item: SafeRewriteItem): string {
  if (item.names.length === 0) {
    return "A whimsical cartoon scene with playful characters.";
  }
  if (item.names.length === 1) {
    return `${item.names[0]} strikes a comedic cartoon pose in a whimsical scene.`;
  }
  const list = item.names.slice(0, -1).join(", ") + " and " + item.names[item.names.length - 1];
  return `${list} share a comedic cartoon moment together in a whimsical scene.`;
}

async function callSanitizer(
  items: SafeRewriteItem[],
  level: SanitizeLevel,
  retryDueToNameDrop = false
): Promise<string[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(level, retryDueToNameDrop) },
          { role: "user", content: JSON.stringify({ items }) },
        ],
        temperature: 0.6,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = JSON.parse(content) as { captions?: unknown };
    if (!Array.isArray(parsed.captions) || parsed.captions.length !== items.length) {
      return null;
    }
    return parsed.captions.map((c) => (typeof c === "string" ? c.trim() : ""));
  } catch {
    return null;
  }
}

/**
 * Rewrite each caption to an image-safe version at the given escalation
 * `level` (0 = mildest, matches raw text closely; 2 = safest whimsical).
 * At the given level we still do an internal name-preservation retry, and
 * finally synthesise a name-preserving safe caption so downstream code
 * always sees valid captions with every required name.
 */
export async function sanitizeCaptionsForImage(
  items: SafeRewriteItem[],
  level: SanitizeLevel = 0
): Promise<string[]> {
  if (!OPENAI_API_KEY || items.length === 0) return items.map((i) => i.caption);

  const finalResults: (string | null)[] = items.map(() => null);
  let pendingIndices: number[] = items.map((_, i) => i);

  // First attempt at the requested level; up to one retry if names went missing.
  for (let attempt = 0; attempt < 2 && pendingIndices.length > 0; attempt++) {
    const attemptItems = pendingIndices.map((i) => items[i]);
    const rewrites = await callSanitizer(attemptItems, level, attempt > 0);

    const stillPending: number[] = [];
    pendingIndices.forEach((origIdx, k) => {
      const rw = rewrites?.[k];
      if (rw && preservesNames(rw, items[origIdx].names)) {
        finalResults[origIdx] = rw;
      } else {
        stillPending.push(origIdx);
      }
    });
    pendingIndices = stillPending;
  }

  pendingIndices.forEach((i) => {
    finalResults[i] = synthesizeFallback(items[i]);
  });

  return finalResults.map((r, i) => r ?? synthesizeFallback(items[i]));
}
