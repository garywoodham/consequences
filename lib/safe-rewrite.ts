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
  "2. Preserve every setting, story beat and adult humour.\n" +
  "3. KEEP AS MUCH OF THE ORIGINAL WORDING AS POSSIBLE. Only touch the " +
  "specific phrase that would trip an image filter — everything else stays " +
  "verbatim.\n" +
  "4. Do NOT lengthen the caption. Keep it about the same length or shorter.\n" +
  "5. No moralising, apologies, disclaimers or explanations.\n";

const LEVEL_INSTRUCTIONS: Record<SanitizeLevel, string> = {
  // Level 0 is the DEFAULT. We only reach this level for captions that a
  // heuristic pre-filter flagged as likely to be refused. Everything else is
  // passed through untouched by the sanitiser. So Level 0 can afford to stay
  // spicy: we're already dealing with edgy captions and we want to preserve as
  // much of the original punch as possible.
  0:
    "You are the minimal image-safety pass for an ADULT party game. Players " +
    "wrote something adult and it will show verbatim under the picture — you " +
    "only tweak the phrase that would upset the image model, and leave " +
    "everything else alone. Prefer surgically swapping ONE phrase for a " +
    "cheeky adult euphemism of similar length.\n\n" +
    "GOOD (surgical) rewrites — notice they keep the sentence structure:\n" +
    "  • 'Alice and Bob had sex on the sofa'\n" +
    "      → 'Alice and Bob got busy under a blanket on the sofa'\n" +
    "  • 'Bob got completely naked in the kitchen'\n" +
    "      → 'Bob stripped down to just an apron in the kitchen'\n" +
    "  • 'Kim went down on Sara at the party'\n" +
    "      → 'Kim disappeared under Sara\\'s skirt at the party'\n" +
    "  • 'Dave shot Kim in the face with a rifle'\n" +
    "      → 'Dave blasted Kim in the face with a cartoon pop-gun'\n" +
    "  • 'Sara snorted a huge line of cocaine'\n" +
    "      → 'Sara snorted a huge line of sherbet powder'\n" +
    "  • 'They got absolutely wasted on tequila'\n" +
    "      → 'They got absolutely plastered on tequila, empty glasses everywhere'\n" +
    "\n" +
    "Bad — do NOT do this:\n" +
    "  ✗ Turning a one-line caption into three sentences of aftermath.\n" +
    "  ✗ Making it wholesome, kid-friendly, or generically 'whimsical'.\n" +
    "  ✗ Dropping or paraphrasing the character names.\n" +
    "  ✗ Rewriting phrases that are already fine (leave them exactly as they " +
    "    are).\n" +
    "If the caption already reads image-safe, RETURN IT UNCHANGED.",
  1:
    "STRONGER RETRY. The image model still refused. Move slightly further " +
    "from the explicit act itself but stay adult in tone. Prefer describing " +
    "the aftermath, mood or props (rumpled sheets, empty bottles, dramatic " +
    "cartoon reactions) rather than the act itself. Keep the caption short " +
    "and every required name must appear verbatim.\n\n" +
    "Examples:\n" +
    "  • 'Alice and Bob had sex'\n" +
    "      → 'Alice and Bob tangled in the duvet afterwards, both flushed'\n" +
    "  • 'Bob got naked'\n" +
    "      → 'Bob wearing only a strategically placed cushion, clothes on the floor'\n" +
    "  • 'Dave shot Kim'\n" +
    "      → 'Kim collapsed with cartoon X-eyes and stars, Dave holding a smoking pop-gun'\n" +
    "  • 'Sara did cocaine'\n" +
    "      → 'Sara wild-eyed with spiral pupils, dust on her nose'\n",
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

/**
 * Heuristic: is this caption likely to trip image-model moderation? We only
 * touch obviously spicy captions so that mild ones (which are the majority)
 * reach the image model untouched with all their original flavour intact.
 */
const TRIGGER_PATTERNS: RegExp[] = [
  // Nudity / sex acts
  /\bnaked\b/i,
  /\bnude\b/i,
  /\bstark naked\b/i,
  /\bin the nude\b/i,
  /\btopless\b/i,
  /\bbottomless\b/i,
  /\bstrip(ped|ping)?\b/i,
  /\bsex\b/i,
  /\bhad sex\b/i,
  /\bhaving sex\b/i,
  /\bmaking love\b/i,
  /\bshag(ged|ging)?\b/i,
  /\bbon(k|ked|king)\b/i,
  /\bfuck(ed|ing|s)?\b/i,
  /\bblowjob\b/i,
  /\bblow job\b/i,
  /\bhandjob\b/i,
  /\bgoing down on\b/i,
  /\bwent down on\b/i,
  /\borgasm(s|ed|ing)?\b/i,
  /\bmasturbat\w+/i,
  /\bwank(ed|ing)?\b/i,
  /\bboob(s|ies)?\b/i,
  /\btits?\b/i,
  /\bnipples?\b/i,
  /\bpenis\b/i,
  /\bcock\b/i,
  /\bdick\b/i,
  /\bvagina\b/i,
  /\bpussy\b/i,
  /\barse\b/i,
  /\bass(hole)?\b/i,
  /\bbutthole\b/i,

  // Drugs
  /\bcocaine\b/i,
  /\bcoke\b/i,
  /\bheroin\b/i,
  /\bmeth\b/i,
  /\bcrack\b/i,
  /\becstasy\b/i,
  /\bmdma\b/i,
  /\bketamine\b/i,
  /\bsnort(ed|ing)?\b/i,
  /\binject(ed|ing)?\b/i,
  /\bshoot(ing)? up\b/i,

  // Weapons / gore
  /\bshot(gun|s)?\b/i,
  /\bshot\b/i,
  /\brifle\b/i,
  /\bpistol\b/i,
  /\bstab(bed|bing)?\b/i,
  /\bmurder(ed|ing)?\b/i,
  /\bkill(ed|ing)?\b/i,
  /\bhang(ed|ing)?\b/i,
  /\bstrangle(d|s)?\b/i,
  /\bslit\b.*\bthroat\b/i,
  /\bblood(y|ied)?\b/i,
  /\bgore\b/i,
];

function mayNeedSanitizing(caption: string): boolean {
  return TRIGGER_PATTERNS.some((re) => re.test(caption));
}

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
        temperature: 0.5,
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
 *
 * At Level 0 we ALSO pre-filter with a keyword heuristic and skip the LLM
 * entirely for captions that look fine — this preserves the original edgy
 * wording of most captions. At higher levels every caption is rewritten
 * because we've already learnt that the image model refused it.
 */
export async function sanitizeCaptionsForImage(
  items: SafeRewriteItem[],
  level: SanitizeLevel = 0
): Promise<string[]> {
  if (!OPENAI_API_KEY || items.length === 0) return items.map((i) => i.caption);

  const finalResults: (string | null)[] = items.map((it, i) => {
    if (level === 0 && !mayNeedSanitizing(it.caption)) {
      // Caption doesn't contain any obvious trigger words — leave it alone.
      return it.caption;
    }
    // Marked for rewrite. Placeholder overwritten below.
    void i;
    return null;
  });

  let pendingIndices: number[] = finalResults
    .map((v, i) => (v === null ? i : -1))
    .filter((i) => i >= 0);

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
