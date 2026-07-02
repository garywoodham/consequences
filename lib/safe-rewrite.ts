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
    "You are the *lightest possible* image-safety pass for an adult party " +
    "game. Do NOT sanitise wholesomely — the humour is meant to be crude and " +
    "cheeky and readers WILL see the raw caption; you are only adjusting what " +
    "the image model sees.\n\n" +
    "Only change wording where an image generator would refuse. Use the " +
    "MINIMUM softening required. Prefer the sexiest / edgiest workaround that " +
    "still passes. Keep the same tone; do not turn adult humour into " +
    "children's cartoon.\n\n" +
    "Examples of the RIGHT level of softening:\n" +
    "  • 'Bob got naked' → 'Bob wearing only a tiny strategic towel around " +
    "his waist, otherwise nude'\n" +
    "  • 'Alice and Dave had sex' → 'Alice and Dave visibly making out under " +
    "the covers, only bare shoulders showing'\n" +
    "  • 'Kim gave Sara a blowjob' → 'Kim and Sara in a suggestive pose, " +
    "Kim kneeling in front of Sara, both fully clothed but heavily implied'\n" +
    "  • 'Dave shot Kim with a rifle' → 'Dave aiming a comically oversized " +
    "cartoon rifle at Kim in a slapstick face-off'\n" +
    "  • 'Sara did lines of cocaine' → 'Sara enthusiastically snorting a " +
    "line of glittery sherbet off a mirror'\n" +
    "\n" +
    "If the caption is already safe, return it unchanged.",
  1:
    "STRONGER RETRY. Your previous rewrite (or the un-softened caption) was " +
    "still likely to be refused by the image model. Escalate to visual " +
    "workarounds that clearly imply the same idea without showing what would " +
    "be refused. Keep it adult and cheeky, not childish.\n\n" +
    "Examples:\n" +
    "  • 'Bob got naked' → 'Bob wearing a skin-toned bodysuit with his " +
    "entire body pixelated/blurred to imply nudity'\n" +
    "  • 'Alice and Dave had sex' → 'Alice and Dave in bed, blanket covering " +
    "everything, exaggerated cartoon 'sound effect' shapes flying off (no " +
    "text)'\n" +
    "  • 'Kim gave Sara a blowjob' → 'Kim kneeling in front of Sara with " +
    "her face pixelated/censored, Sara looking blissfully skyward'\n" +
    "  • 'Dave shot Kim' → 'Dave with a joke pop-gun and a big \"BANG\" " +
    "flag on a stick emerging from it, Kim theatrically fainting'\n" +
    "\n" +
    "Every required name MUST still appear verbatim.",
  2:
    "LAST RETRY. Both previous attempts were rejected. Fall back to a very " +
    "gentle whimsical cartoon description of the same story beat. Every " +
    "required name MUST still appear verbatim. Prefer harmless, absurd " +
    "actions that at least gesture at the original vibe.",
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
