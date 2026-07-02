// Server-only: rewrites edgy story moments into image-safe euphemisms so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT =
  "You rewrite comic-panel scene captions so an image generator is unlikely " +
  "to refuse them, while keeping the story intact. This is for an adult party " +
  "game; the rewrites should still feel adult and cheeky.\n\n" +
  "ABSOLUTE RULES:\n" +
  "1. Every character name provided in `names` MUST appear in the rewrite " +
  "spelled EXACTLY as given, in the same role/position they had in the " +
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
  "5. If the caption is already safe, return it unchanged.\n" +
  "6. No moralising, apologies or explanations.\n\n" +
  "Return JSON with the exact shape: {\"captions\": [\"...\", \"...\"]} " +
  "with the same number of items as the input array, in the same order.";

export function hasSafeRewriteProvider(): boolean {
  return Boolean(OPENAI_API_KEY);
}

export type SafeRewriteItem = { caption: string; names: string[] };

/** All required names appear (case-insensitively) as whole-word matches. */
function preservesNames(rewrite: string, names: string[]): boolean {
  const lower = rewrite.toLowerCase();
  return names.every((n) => {
    const needle = n.trim().toLowerCase();
    if (!needle) return true;
    const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  });
}

/**
 * Rewrite each caption to an image-safe version. Character names must be
 * preserved verbatim; if a rewrite drops any expected name the original
 * caption is used for that item instead. Any failure falls back to originals.
 */
export async function sanitizeCaptionsForImage(items: SafeRewriteItem[]): Promise<string[]> {
  if (!OPENAI_API_KEY || items.length === 0) return items.map((i) => i.caption);

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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ items }) },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return items.map((i) => i.caption);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return items.map((i) => i.caption);
    const parsed = JSON.parse(content) as { captions?: unknown };
    if (!Array.isArray(parsed.captions) || parsed.captions.length !== items.length) {
      return items.map((i) => i.caption);
    }
    return parsed.captions.map((c, i) => {
      const orig = items[i].caption;
      if (typeof c !== "string" || !c.trim()) return orig;
      const rewrite = c.trim();
      // Belt-and-braces: if any required name is missing, keep the original so
      // the wrong person isn't drawn.
      if (!preservesNames(rewrite, items[i].names)) return orig;
      return rewrite;
    });
  } catch {
    return items.map((i) => i.caption);
  }
}
