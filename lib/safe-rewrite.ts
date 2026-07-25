// Server-only: rewrites edgy story moments into image-safe workarounds so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.
//
// Strategy when an image is blocked:
//   1. Surgical framing / implication rewrite (keep the joke, hide the trigger)
//   2. Stronger aftermath / props rewrite
//   3. Context-preserving cartoon beat (still about the same moment)
// Plus a deterministic local softener as a guaranteed first soft pass so we
// never depend solely on the LLM.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Escalation ladder for the sanitiser. Start mild; only go harder on refusal. */
export type SanitizeLevel = 0 | 1 | 2;

const BASE_RULES =
  "ABSOLUTE RULES:\n" +
  "1. Every character name provided for an item MUST appear in that item's " +
  "rewrite spelled EXACTLY as given, in the same role/position it had in the " +
  "original caption. Do not replace names with pronouns, roles ('the man'), " +
  "or different names, and do not swap who is doing what.\n" +
  "2. Preserve the SAME story beat, setting, and adult humour. The rewrite " +
  "must still clearly be about the same moment — do NOT invent a different " +
  "scene, moralise, or make it wholesome/kid-friendly.\n" +
  "3. KEEP AS MUCH OF THE ORIGINAL WORDING AS POSSIBLE. Only change the " +
  "phrase that would trip an image filter.\n" +
  "4. Do NOT lengthen the caption much. Keep it about the same length.\n" +
  "5. No moralising, apologies, disclaimers or explanations.\n" +
  "6. Prefer FRAMING and IMPLICATION over inventing props that change the " +
  "story (shoulders-up crop, sheet wrapped around them, covering themselves " +
  "with arms, silhouette, steam, rumpled duvet, flushed faces).\n";

const LEVEL_INSTRUCTIONS: Record<SanitizeLevel, string> = {
  0:
    "You are the image-safety pass for an ADULT party game. The image model " +
    "just REFUSED this caption. Soften ONLY the blocked phrase so a comic " +
    "panel can still be drawn that matches the joke. Prefer framing tricks " +
    "and implication over changing the story.\n\n" +
    "GOOD rewrites (same beat, image-safe framing). Names below are often " +
    "neutral labels like 'Character 1' — keep whatever names you are given " +
    "verbatim, never invent real-person names:\n" +
    "  • 'Character 2 got completely naked in the kitchen'\n" +
    "      → 'Character 2 in the kitchen seen from the shoulders up, covering " +
    "himself with his arms, clothes on the floor'\n" +
    "  • 'Character 1 was naked on the sofa'\n" +
    "      → 'Character 1 on the sofa wrapped in a thin sheet from the " +
    "shoulders down, looking shocked'\n" +
    "  • 'Character 1 and Character 2 had sex on the sofa'\n" +
    "      → 'Character 1 and Character 2 cuddled and kissed on the sofa, " +
    "wrapped in a rumpled duvet'\n" +
    "  • 'They were having sex'\n" +
    "      → 'Character 1 and Character 2 cuddled and kissed passionately " +
    "under the covers'\n" +
    "  • 'Character 1 went down on Character 2 at the party'\n" +
    "      → 'Character 1 disappeared under Character 2\\'s skirt at the party'\n" +
    "  • 'Character 1 shot Character 2 in the face with a rifle'\n" +
    "      → 'Character 1 blasted Character 2 in the face with a cartoon pop-gun'\n" +
    "  • 'Character 1 snorted a huge line of cocaine'\n" +
    "      → 'Character 1 snorted a huge line of sherbet powder'\n" +
    "\n" +
    "When the caption has two named people, BOTH names must stay and refer to " +
    "the SAME two people — do not invent a third person or swap who is who.\n" +
    "\n" +
    "Bad — do NOT do this:\n" +
    "  ✗ Leaving the trigger word in (naked/nude/sex/cock/etc.).\n" +
    "  ✗ Turning it into a wholesome or unrelated scene.\n" +
    "  ✗ Dropping or paraphrasing the character names.\n" +
    "  ✗ Rewriting phrases that are already fine.\n",
  1:
    "STRONGER RETRY. The image model still refused. Soften further while " +
    "keeping the same story beat and adult tone. Lean harder on aftermath, " +
    "framing, and romantic implication (cuddling, kissing, flushed faces, " +
    "rumpled sheets) without showing the act.\n\n" +
    "Examples (keep given labels/names verbatim):\n" +
    "  • 'Character 2 got naked'\n" +
    "      → 'Character 2 covering himself with a cushion, clothes piled on " +
    "the floor, framed from the waist up'\n" +
    "  • 'Character 1 and Character 2 had sex'\n" +
    "      → 'Character 1 and Character 2 cuddled and kissed under the duvet " +
    "afterwards, both flushed and giggling'\n" +
    "  • 'Character 1 shot Character 2'\n" +
    "      → 'Character 2 collapsed with cartoon X-eyes and stars, Character 1 " +
    "holding a smoking pop-gun'\n" +
    "  • 'Character 1 did cocaine'\n" +
    "      → 'Character 1 wild-eyed with spiral pupils, white dust on her nose'\n",
  2:
    "LAST RETRY. Keep the SAME characters, setting and joke intent, but " +
    "depict it as a cheeky PG-13 cartoon beat — still recognisably the same " +
    "moment (cuddling, kissing, rumpled bed, empty glasses, shocked faces), " +
    "never a generic unrelated whimsical scene. Every required name MUST " +
    "appear verbatim as the same people.",
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

export type SafeRewriteItem = {
  caption: string;
  names: string[];
  /** Optional previously-refused caption, so the LLM can escalate from it. */
  refusedCaption?: string;
};

/**
 * Heuristic: is this caption likely to trip image-model moderation?
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
  /\bundress(ed|ing)?\b/i,
  /\bno clothes\b/i,
  /\bwithout (any )?clothes\b/i,
  /\bsex\b/i,
  /\bhad sex\b/i,
  /\bhaving sex\b/i,
  /\bhave sex\b/i,
  /\bmaking love\b/i,
  /\bmade love\b/i,
  /\bslept together\b/i,
  /\bsleeping together\b/i,
  /\bhooked up\b/i,
  /\bhooking up\b/i,
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

export function mayNeedSanitizing(caption: string): boolean {
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
 * If a rewrite dropped the required names (common when the caption said
 * "they had sex"), put the SAME people back in — replace "they" with the
 * name pair, or prepend the names. Never invent a third person.
 */
function ensureNamesPresent(caption: string, names: string[]): string {
  const needed = names.map((n) => n.trim()).filter(Boolean);
  if (needed.length === 0 || preservesNames(caption, needed)) return caption;

  if (needed.length === 1) {
    if (/\bthey\b/i.test(caption)) {
      return caption.replace(/\bthey\b/i, needed[0]);
    }
    return `${needed[0]} — ${caption}`;
  }

  const pair = `${needed[0]} and ${needed[1]}`;
  if (/\bthey\b/i.test(caption)) {
    return caption.replace(/\bthey\b/i, pair);
  }
  // Already has one of the names — append the missing one beside it if possible.
  if (preservesNames(caption, [needed[0]]) && !preservesNames(caption, [needed[1]])) {
    return caption.replace(
      new RegExp(`(?<!\\p{L})${needed[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "iu"),
      pair
    );
  }
  if (preservesNames(caption, [needed[1]]) && !preservesNames(caption, [needed[0]])) {
    return caption.replace(
      new RegExp(`(?<!\\p{L})${needed[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "iu"),
      pair
    );
  }
  return `${pair} — ${caption}`;
}

/**
 * Deterministic local softener for common trigger phrases. Used as a
 * guaranteed first soft pass so we don't depend solely on the LLM, and as a
 * last resort that still keeps the story beat instead of a generic whimsical
 * scene. Returns null if nothing matched.
 */
export function localSoften(
  caption: string,
  level: SanitizeLevel = 0,
  names: string[] = []
): string | null {
  let out = caption;
  let changed = false;

  const swaps: { re: RegExp; mild: string; stronger: string }[] = [
    {
      re: /\b(?:got |was |were )?(?:completely |stark |totally )?(?:naked|nude)\b/gi,
      mild:
        "seen from the shoulders up, covering themselves with their arms, clothes on the floor",
      stronger:
        "wrapped in a thin sheet from the shoulders down, looking shocked, clothes on the floor",
    },
    {
      re: /\btopless\b/gi,
      mild: "seen from the shoulders up, arms crossed over their chest",
      stronger: "wearing only a strategically held towel across the chest",
    },
    {
      re: /\bbottomless\b/gi,
      mild: "framed from the waist up, covering themselves with a cushion",
      stronger: "wrapped in a bedsheet from the waist down",
    },
    {
      re: /\b(?:stripped|stripping|strip)\b/gi,
      mild: "in a state of undress, covering themselves",
      stronger: "wrapped in a sheet, clothes piled nearby",
    },
    {
      re: /\b(?:were |was |are |is )?(?:had sex|having sex|have sex|made love|making love)\b/gi,
      mild: "cuddled and kissed under a rumpled duvet",
      stronger: "cuddled and kissed passionately under the covers afterwards, both flushed",
    },
    {
      re: /\b(?:shagged|shagging|shag|bonked|bonking|bonk)\b/gi,
      mild: "cuddled and kissed under a blanket",
      stronger: "cuddled and kissed under the sheets afterwards, both flushed",
    },
    {
      re: /\bfuck(?:ed|ing|s)?\b/gi,
      mild: "cuddled and kissed",
      stronger: "cuddled and kissed under the covers",
    },
    {
      re: /\b(?:slept together|sleeping together|hooked up|hooking up)\b/gi,
      mild: "cuddled and kissed",
      stronger: "cuddled up together under a rumpled duvet",
    },
    {
      re: /\b(?:went down on|going down on)\b/gi,
      mild: "disappeared under",
      stronger: "vanished mischievously under a tablecloth near",
    },
    {
      re: /\b(?:blow ?job|handjob)\b/gi,
      mild: "a very private cuddle under the table",
      stronger: "a mischievous cuddle under the tablecloth",
    },
    {
      re: /\b(?:boobs?|tits?|nipples?)\b/gi,
      mild: "chest",
      stronger: "upper body",
    },
    {
      re: /\b(?:penis|cock|dick|vagina|pussy)\b/gi,
      mild: "nothing visible below a carefully placed sheet",
      stronger: "nothing visible below a carefully placed sheet",
    },
    {
      re: /\b(?:cocaine|coke|heroin|meth|mdma|ecstasy|ketamine)\b/gi,
      mild: "sherbet powder",
      stronger: "sparkly party powder",
    },
    {
      re: /\b(?:rifle|pistol|shotgun)\b/gi,
      mild: "cartoon pop-gun",
      stronger: "oversized comedy water pistol",
    },
    {
      re: /\b(?:shot|stabbed|murdered|killed)\b/gi,
      mild: "blasted with a cartoon pop-gun",
      stronger: "knocked out with cartoon X-eyes and stars",
    },
  ];

  for (const swap of swaps) {
    // Reset lastIndex for global regexes before testing/replacing.
    swap.re.lastIndex = 0;
    if (swap.re.test(out)) {
      swap.re.lastIndex = 0;
      out = out.replace(swap.re, level === 0 ? swap.mild : swap.stronger);
      changed = true;
    }
  }

  out = out.replace(/\s+/g, " ").trim();
  if (!changed || out === caption.trim()) return null;
  return ensureNamesPresent(out, names);
}

/**
 * Context-preserving last resort if every other attempt fails. Keeps names
 * and a hint of the original caption rather than inventing a whimsical scene.
 */
function synthesizeFallback(item: SafeRewriteItem): string {
  const local = localSoften(item.caption, 2, item.names);
  if (local && preservesNames(local, item.names)) return local;

  // Strip triggers from the original for a lightweight context keep.
  let stripped = item.caption;
  for (const re of TRIGGER_PATTERNS) stripped = stripped.replace(re, "");
  stripped = stripped
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

  // Nothing spicy to remove — keep the original caption rather than inventing
  // a generic scene that drifts from the story.
  if (!mayNeedSanitizing(item.caption) || stripped === item.caption.trim()) {
    return item.caption;
  }

  if (item.names.length === 0) {
    return stripped
      ? `A cheeky cartoon scene: ${stripped}`
      : "A cheeky cartoon scene with playful characters.";
  }
  if (item.names.length === 1) {
    return stripped
      ? `${item.names[0]} in a cheeky cartoon moment: ${stripped}`
      : `${item.names[0]} in a cheeky cartoon moment, looking shocked.`;
  }
  const list =
    item.names.slice(0, -1).join(", ") + " and " + item.names[item.names.length - 1];
  return stripped
    ? `${list} in a cheeky cartoon moment: ${stripped}`
    : `${list} share a cheeky cartoon moment together.`;
}

async function callSanitizer(
  items: SafeRewriteItem[],
  level: SanitizeLevel,
  retryDueToNameDrop = false
): Promise<string[] | null> {
  try {
    const payload = items.map((it) => ({
      caption: it.caption,
      names: it.names,
      ...(it.refusedCaption ? { previouslyRefused: it.refusedCaption } : {}),
    }));
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
          {
            role: "user",
            content:
              "The image model refused the previous prompt. Soften each caption " +
              "so it can be drawn, keeping the same story beat.\n" +
              JSON.stringify({ items: payload }),
          },
        ],
        temperature: 0.4,
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

export type SanitizeOptions = {
  /**
   * When true (refusal path), always rewrite — never skip via the keyword
   * heuristic. A caption can be refused even without matching our trigger list.
   */
  force?: boolean;
};

/**
 * Rewrite each caption to an image-safe version at the given escalation
 * `level` (0 = framing/implication; 1 = stronger aftermath; 2 = PG-13 cartoon).
 *
 * On the refusal path (`force: true`) we ALWAYS produce a different caption:
 *   local softener → LLM rewrite → context-preserving fallback.
 * At Level 0 without force, mild captions with no trigger words are left alone.
 */
export async function sanitizeCaptionsForImage(
  items: SafeRewriteItem[],
  level: SanitizeLevel = 0,
  options: SanitizeOptions = {}
): Promise<string[]> {
  const force = Boolean(options.force);
  if (!OPENAI_API_KEY || items.length === 0) {
    return items.map((it) => {
      if (!force && level === 0 && !mayNeedSanitizing(it.caption)) return it.caption;
      return localSoften(it.caption, level, it.names) ?? synthesizeFallback(it);
    });
  }

  const finalResults: (string | null)[] = items.map((it) => {
    if (!force && level === 0 && !mayNeedSanitizing(it.caption)) {
      return it.caption;
    }
    // At level 0, prefer the cheap deterministic local softener first.
    // At higher levels (or when we need a fresh rewrite after a local pass
    // already failed), leave null so the LLM gets a chance.
    if (level === 0) {
      const local = localSoften(it.caption, level, it.names);
      if (local && local !== it.caption.trim()) {
        return local;
      }
    }
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
      const original = items[origIdx].caption.trim();
      const spicy = mayNeedSanitizing(original);
      if (!rw) {
        stillPending.push(origIdx);
        return;
      }
      const withNames = ensureNamesPresent(rw, items[origIdx].names);
      if (
        preservesNames(withNames, items[origIdx].names) &&
        // Spicy captions must change; clean ones may stay as-is.
        (!spicy || withNames !== original) &&
        // Prefer rewrites that actually removed triggers when the original had them.
        (!spicy || !mayNeedSanitizing(withNames) || level >= 1)
      ) {
        finalResults[origIdx] = withNames;
      } else {
        stillPending.push(origIdx);
      }
    });
    pendingIndices = stillPending;
  }

  pendingIndices.forEach((i) => {
    const local = localSoften(items[i].caption, level, items[i].names);
    finalResults[i] = local ?? synthesizeFallback(items[i]);
  });

  return finalResults.map((r, i) => {
    let result = r ?? synthesizeFallback(items[i]);
    result = ensureNamesPresent(result, items[i].names);
    // On the refusal path for spicy captions, never return the identical
    // original — that wastes an image attempt. Clean captions can stay as-is
    // (the caller already tried them).
    if (
      force &&
      mayNeedSanitizing(items[i].caption) &&
      result.trim() === items[i].caption.trim()
    ) {
      return (
        localSoften(items[i].caption, level, items[i].names) ??
        synthesizeFallback(items[i])
      );
    }
    return result;
  });
}
