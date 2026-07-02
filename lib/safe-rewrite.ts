// Server-only: rewrites edgy story moments into image-safe euphemisms so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT =
  "You rewrite comic-panel scene captions so an image generator is unlikely " +
  "to refuse them, while keeping the story intact. This is for an adult party " +
  "game; the rewrites should still feel adult and cheeky.\n\n" +
  "STRICT RULES:\n" +
  "- Preserve every character (by exact name), setting and story beat.\n" +
  "- Replace anything an image model might refuse (nudity, explicit sex, " +
  "graphic gore, drug use, hate imagery, weapons pointed at people, real " +
  "public figures) with a WHOLESOME BUT CLEARLY IMPLIED equivalent that " +
  "conveys the same idea (e.g. 'got naked' → 'wrapped only in a bedsheet, " +
  "coyly clutching it to their chest'; 'shot them' → 'zapped them with a " +
  "toy ray-gun'; 'did drugs' → 'sipped a suspiciously glowing cocktail').\n" +
  "- Keep the humour and absurdity of the original.\n" +
  "- Keep it a single short caption per input (roughly the same length).\n" +
  "- If the caption is already safe, return it unchanged.\n" +
  "- Do not add moralising, apologies or explanations.\n\n" +
  "Return JSON with the exact shape: {\"captions\": [\"...\", \"...\"]} " +
  "with the same number of items as the input array, in the same order.";

export function hasSafeRewriteProvider(): boolean {
  return Boolean(OPENAI_API_KEY);
}

/**
 * Rewrites each caption to an image-safe version. Returns the original captions
 * on any failure so comic generation is never blocked by the sanitiser itself.
 */
export async function sanitizeCaptionsForImage(captions: string[]): Promise<string[]> {
  if (!OPENAI_API_KEY || captions.length === 0) return captions;

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
          { role: "user", content: JSON.stringify({ captions }) },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return captions;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return captions;
    const parsed = JSON.parse(content) as { captions?: unknown };
    if (!Array.isArray(parsed.captions) || parsed.captions.length !== captions.length) {
      return captions;
    }
    return parsed.captions.map((c, i) =>
      typeof c === "string" && c.trim() ? c.trim() : captions[i]
    );
  } catch {
    return captions;
  }
}
