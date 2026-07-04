// Server-only module: reads OPENAI_API_KEY to polish story wording.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT =
  "You tidy up the wording of a 'Consequences' party game story so it reads as " +
  "smooth, grammatical, genuinely funny prose. Players contribute fragments — some " +
  "write single words, others full sentences — so fix grammar, capitalisation, " +
  "punctuation and connect fragments into readable sentences. STRICT RULES: keep " +
  "all the same people, places, actions and events; do NOT invent new plot points; " +
  "keep the character names exactly as written; keep it roughly the same length and " +
  "keep the playful, absurd tone. Return ONLY the tidied story text with no preamble.";

export function hasTidyProvider(): boolean {
  return Boolean(OPENAI_API_KEY);
}

async function tidyOne(prose: string): Promise<string> {
  if (!OPENAI_API_KEY) return prose;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prose },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return prose;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : prose;
  } catch {
    return prose;
  }
}

/** Polish each story's prose into readable sentences (falls back to original). */
export async function tidyStories(
  stories: { id: string; prose: string }[]
): Promise<{ id: string; tidyProse: string }[]> {
  return Promise.all(
    stories.map(async (s) => ({ id: s.id, tidyProse: await tidyOne(s.prose) }))
  );
}
