// Server-only: rewrites edgy story moments into image-safe euphemisms so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const BASE_RULES =
  "ABSOLUTE RULES:\n" +
  "1. Every character name provided for an item MUST appear in that item's " +
  "rewrite spelled EXACTLY as given, in the same role/position it had in the " +
  "original caption (the actor stays the actor, not swapped with anyone " +
  "else). Do not replace names with pronouns, roles ('the man'), or " +
  "different names.\n" +
  "2. Preserve every setting and story beat.\n" +
  "3. Replace anything an image model might refuse (nudity, explicit sex, " +
  "graphic gore, drug use, hate imagery, weapons pointed at people, real " +
  "public figures) with a WHOLESOME BUT CLEARLY IMPLIED equivalent that " +
  "still conveys the idea (e.g. 'Bob got naked' → 'Bob wrapped only in a " +
  "bedsheet, coyly clutching it to his chest'; 'Dave shot Kim' → 'Dave " +
  "zapped Kim with a toy ray-gun'; 'Sara did drugs' → 'Sara sipped a " +
  "suspiciously glowing cocktail').\n" +
  "4. Keep the humour and absurdity, roughly the same length, one caption " +
  "per input.\n" +
  "5. If the caption is already safe AND already contains every required " +
  "name verbatim, return it unchanged.\n" +
  "6. No moralising, apologies or explanations.\n";

function systemPrompt(attempt: number): string {
  const strictness =
    attempt === 0
      ? "You rewrite comic-panel scene captions so an image generator is " +
        "unlikely to refuse them, while keeping the story intact. This is " +
        "for an adult party game; the rewrites should still feel adult and " +
        "cheeky.\n\n"
      : attempt === 1
        ? "STRICTER RETRY. Your last rewrite dropped or altered one or more " +
          "required character names. This is unacceptable — every listed " +
          "name MUST appear verbatim in that item's rewrite. Also soften " +
          "the wording more aggressively so the image model will accept " +
          "it.\n\n"
        : "FINAL RETRY. Previous attempts failed. Produce very gentle, " +
          "family-friendly cartoon descriptions that still hint at the " +
          "story beat, but every required name MUST appear verbatim in " +
          "its own item's rewrite. Prefer harmless, whimsical actions.\n\n";

  return (
    strictness +
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
    // Unicode-aware boundaries so names like "Beyoncé" match correctly.
    const re = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu");
    return re.test(rewrite);
  });
}

/**
 * A guaranteed name-preserving, image-safe caption for a panel when even the
 * retry loop failed. Not funny — but it never gets refused and always draws
 * the right people.
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
  attempt: number
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
          { role: "system", content: systemPrompt(attempt) },
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
 * Rewrite each caption to an image-safe version. Character names must be
 * preserved verbatim; on failure the sanitiser retries with escalating
 * strictness, and finally synthesises a name-preserving safe caption so the
 * image model always draws the right people.
 */
export async function sanitizeCaptionsForImage(items: SafeRewriteItem[]): Promise<string[]> {
  if (!OPENAI_API_KEY || items.length === 0) return items.map((i) => i.caption);

  const finalResults: (string | null)[] = items.map(() => null);
  let pendingIndices: number[] = items.map((_, i) => i);
  const MAX_ATTEMPTS = 3;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && pendingIndices.length > 0; attempt++) {
    const attemptItems = pendingIndices.map((i) => items[i]);
    const rewrites = await callSanitizer(attemptItems, attempt);

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

  // Anything the retry loop couldn't rescue → synthesised safe caption that is
  // guaranteed to contain every required name.
  pendingIndices.forEach((i) => {
    finalResults[i] = synthesizeFallback(items[i]);
  });

  return finalResults.map((r, i) => r ?? synthesizeFallback(items[i]));
}
