// Server-only: rewrites edgy story moments into image-safe workarounds so the
// image model is less likely to refuse them. Only the *image prompt* is
// changed; the story text shown to players stays exactly as written.
//
// Progressive ladder — each round is a DISTINCT strategy applied to the
// ORIGINAL caption (not a tiny tweak of the previous try):
//   0 = framing hide (shoulders-up / covering with arms)
//   1 = covering with an object (sheet / towel / cushion / bathrobe)
//   2 = underwear / lightly clothed (still cheeky, clearly not nude)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export type SanitizeLevel = 0 | 1 | 2;

const BASE_RULES =
  "ABSOLUTE RULES:\n" +
  "1. Every character name/label provided MUST appear spelled EXACTLY as " +
  "given. Do not invent real-person names. Do not swap who is who.\n" +
  "2. Keep the SAME setting and adult joke intent — do not invent an " +
  "unrelated wholesome scene.\n" +
  "3. Remove EVERY blocked word (naked/nude/sex/fuck/etc.).\n" +
  "4. Keep the caption about the same length.\n" +
  "5. No moralising, apologies, or disclaimers.\n";

const LEVEL_INSTRUCTIONS: Record<SanitizeLevel, string> = {
  0:
    "SOFTEN ROUND 1 — FRAMING HIDE. The image model refused. Rewrite so " +
    "nudity/sex is HIDDEN by camera framing, not removed from the joke.\n\n" +
    "Nudity → shoulders-up crop, covering themselves with arms, clothes on floor.\n" +
    "Sex → cuddled and kissed under a rumpled duvet.\n\n" +
    "Examples:\n" +
    "  • 'Character 2 got naked' → 'Character 2 seen from the shoulders up, " +
    "covering themselves with their arms, clothes on the floor'\n" +
    "  • 'You look good naked' → 'You look good — seen from the shoulders up, " +
    "covering yourself with your arms'\n" +
    "  • 'they Had sex' → 'they cuddled and kissed under a rumpled duvet'\n",
  1:
    "SOFTEN ROUND 2 — COVERING. Round 1 still refused. Rewrite so anyone " +
    "undressed is COVERING themselves with something (sheet, towel, cushion, " +
    "bathrobe) — the joke stays, skin is hidden.\n\n" +
    "Nudity → wrapped in a sheet / towel / bathrobe, covering themselves.\n" +
    "Sex → tangled under a duvet / blanket, covered up, both flushed.\n\n" +
    "Examples:\n" +
    "  • 'Character 2 got naked' → 'Character 2 wrapped in a bedsheet, " +
    "covering themselves, clothes in a pile nearby'\n" +
    "  • 'You look good naked' → 'You look good wrapped in a towel, covering " +
    "yourself'\n" +
    "  • 'they Had sex' → 'they were tangled under a duvet, fully covered, " +
    "both flushed'\n",
  2:
    "SOFTEN ROUND 3 — UNDERWEAR / LIGHT CLOTHING. Rounds 1–2 still refused. " +
    "Rewrite so anyone undressed is clearly wearing underwear or a towel — " +
    "cheeky but not nude. Sex → cuddling in underwear under the covers.\n\n" +
    "Examples:\n" +
    "  • 'Character 2 got naked' → 'Character 2 standing in their underwear, " +
    "looking surprised'\n" +
    "  • 'You look good naked' → 'You look good in your underwear'\n" +
    "  • 'they Had sex' → 'they cuddled in their underwear under the covers'\n",
};

function systemPrompt(level: SanitizeLevel, retryDueToNameDrop = false): string {
  const nameNote = retryDueToNameDrop
    ? "\nCRITICAL: your previous rewrite dropped or altered one or more " +
      "required names. Every listed name MUST appear verbatim.\n"
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
  refusedCaption?: string;
};

const TRIGGER_PATTERNS: RegExp[] = [
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
  /\berection\b/i,
  /\bhard[- ]?on\b/i,
  /\bvagina\b/i,
  /\bpussy\b/i,
  /\bnothing (?:beneath|underneath|under)\b/i,
  /\bno (?:knickers|underwear|pants)\b/i,
  /\bcompletely bare\b/i,
  /\bflashed\b/i,
  /\bflashing\b/i,
  /\bbodily fluids?\b/i,
  /\bmid[- ]?(?:thrust|shag|romp)\b/i,
  /\barse\b/i,
  /\bass(hole)?\b/i,
  /\bbutthole\b/i,
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

function preservesNames(rewrite: string, names: string[]): boolean {
  return names.every((n) => {
    const needle = n.trim();
    if (!needle) return true;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu").test(rewrite);
  });
}

function ensureNamesPresent(caption: string, names: string[]): string {
  const needed = names.map((n) => n.trim()).filter(Boolean);
  if (needed.length === 0 || preservesNames(caption, needed)) return caption;

  if (needed.length === 1) {
    if (/\bthey\b/i.test(caption)) return caption.replace(/\bthey\b/i, needed[0]);
    return `${needed[0]} — ${caption}`;
  }

  const pair = `${needed[0]} and ${needed[1]}`;
  if (/\bthey\b/i.test(caption)) return caption.replace(/\bthey\b/i, pair);
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

type Swap = { re: RegExp; byLevel: [string, string, string] };

/**
 * Deterministic progressive softener. Each level is a DIFFERENT strategy
 * applied to the original caption:
 *   0 framing hide · 1 covering with an object · 2 underwear
 */
export function localSoften(
  caption: string,
  level: SanitizeLevel = 0,
  names: string[] = []
): string | null {
  let out = caption;
  let changed = false;
  const lvl = Math.min(Math.max(level, 0), 2) as SanitizeLevel;

  const swaps: Swap[] = [
    {
      re: /\b(?:got |was |were )?(?:completely |stark |totally )?(?:naked|nude)\b/gi,
      byLevel: [
        "seen from the shoulders up, covering themselves with their arms, clothes on the floor",
        "wrapped in a bedsheet covering themselves, clothes in a pile nearby",
        "standing in their underwear, looking surprised",
      ],
    },
    {
      re: /\bnaked\b/gi,
      byLevel: [
        "seen from the shoulders up, covering themselves with their arms",
        "wrapped in a towel covering themselves",
        "in their underwear",
      ],
    },
    {
      re: /\bnude\b/gi,
      byLevel: [
        "seen from the shoulders up, covering themselves with their arms",
        "wrapped in a towel covering themselves",
        "in their underwear",
      ],
    },
    {
      re: /\btopless\b/gi,
      byLevel: [
        "seen from the shoulders up, arms crossed over their chest",
        "covering their chest with a towel",
        "wearing a camisole",
      ],
    },
    {
      re: /\bbottomless\b/gi,
      byLevel: [
        "framed from the waist up, covering themselves with a cushion",
        "wrapped in a towel covering themselves",
        "wearing underwear",
      ],
    },
    {
      re: /\b(?:stripped|stripping|strip)\b/gi,
      byLevel: [
        "in a state of undress, covering themselves",
        "wrapped in a bathrobe covering themselves, clothes nearby",
        "changed down to their underwear",
      ],
    },
    {
      re: /\b(?:were |was |are |is )?(?:had sex|having sex|have sex|made love|making love)\b/gi,
      byLevel: [
        "cuddled and kissed under a rumpled duvet",
        "were tangled under a duvet, fully covered, both flushed",
        "cuddled in their underwear under the covers",
      ],
    },
    {
      re: /\b(?:shagged|shagging|shag|bonked|bonking|bonk)\b/gi,
      byLevel: [
        "cuddled and kissed under a blanket",
        "were tangled under a blanket, fully covered, both flushed",
        "cuddled in their underwear under the covers",
      ],
    },
    {
      re: /\bfuck(?:ed|ing|s)?\b/gi,
      byLevel: [
        "cuddled and kissed",
        "were covered up under the duvet, both flushed",
        "cuddled in their underwear",
      ],
    },
    {
      re: /\b(?:slept together|sleeping together|hooked up|hooking up)\b/gi,
      byLevel: [
        "cuddled and kissed",
        "were covered up under the duvet, both flushed",
        "cuddled in their underwear under the covers",
      ],
    },
    {
      re: /\b(?:went down on|going down on)\b/gi,
      byLevel: [
        "disappeared under",
        "hid under a blanket near",
        "gave a mischievous wink to",
      ],
    },
    {
      re: /\b(?:blow ?job|handjob)\b/gi,
      byLevel: [
        "a very private cuddle under the table",
        "a cuddle under a covering tablecloth",
        "a cheeky cuddle under the tablecloth",
      ],
    },
    {
      re: /\b(?:boobs?|tits?|nipples?)\b/gi,
      byLevel: ["chest", "outfit", "top"],
    },
    {
      re: /\b(?:penis|cock|dick|vagina|pussy|erection|hard[- ]?on)\b/gi,
      byLevel: [
        "nothing visible below a carefully placed sheet",
        "nothing visible under the covers",
        "nothing visible below their underwear",
      ],
    },
    {
      re: /\blegendary erection\b/gi,
      byLevel: [
        "robe held closed with one hand",
        "bathrobe tied shut",
        "underwear under an open robe",
      ],
    },
    {
      re: /\bnothing (?:beneath|underneath|under)(?: it)?\b/gi,
      byLevel: [
        "covering themselves modestly underneath",
        "a slip underneath",
        "underwear underneath",
      ],
    },
    {
      re: /\bno (?:knickers|underwear|pants)\b/gi,
      byLevel: [
        "covering themselves carefully",
        "a slip underneath",
        "underwear on",
      ],
    },
    {
      re: /\b(?:got |dived in )?completely bare\b/gi,
      byLevel: [
        "seen from the shoulders up, covering themselves",
        "wrapped in a towel covering themselves",
        "in their swimwear",
      ],
    },
    {
      re: /\b(?:peeled everything off|flashed(?: the whole \w+)?|flashing)\b/gi,
      byLevel: [
        "covered up with their arms, clothes nearby",
        "wrapped in a towel, clothes in a heap",
        "changed down to underwear",
      ],
    },
    {
      re: /\bbodily fluids?\b/gi,
      byLevel: ["suspicious puddles", "party mess", "spilled drinks"],
    },
    {
      re: /\bhanging fully open\b/gi,
      byLevel: [
        "held mostly closed",
        "loosely tied",
        "open over underwear",
      ],
    },
    {
      re: /\bmid[- ]?(?:thrust|shag|romp)\b/gi,
      byLevel: [
        "mid-cuddle under covers",
        "tangled under a duvet, covered up",
        "cuddling in underwear under covers",
      ],
    },
    {
      re: /\b(?:cocaine|coke|heroin|meth|mdma|ecstasy|ketamine)\b/gi,
      byLevel: ["sherbet powder", "sparkly party powder", "icing sugar"],
    },
    {
      re: /\b(?:rifle|pistol|shotgun)\b/gi,
      byLevel: ["cartoon pop-gun", "oversized comedy water pistol", "foam noodle"],
    },
    {
      re: /\b(?:shot|stabbed|murdered|killed)\b/gi,
      byLevel: [
        "blasted with a cartoon pop-gun",
        "knocked out with cartoon X-eyes and stars",
        "bonked with a rubber chicken",
      ],
    },
  ];

  for (const swap of swaps) {
    swap.re.lastIndex = 0;
    if (swap.re.test(out)) {
      swap.re.lastIndex = 0;
      out = out.replace(swap.re, swap.byLevel[lvl]);
      changed = true;
    }
  }

  out = out.replace(/\s+/g, " ").trim();
  if (!changed || out === caption.trim()) return null;
  // Must not still contain hard triggers after a soften pass.
  if (mayNeedSanitizing(out) && lvl < 2) {
    // Try once more at a higher level from the ORIGINAL caption.
    return localSoften(caption, ((lvl + 1) as SanitizeLevel), names);
  }
  return ensureNamesPresent(out, names);
}

function synthesizeFallback(item: SafeRewriteItem): string {
  const local = localSoften(item.caption, 2, item.names);
  if (local && preservesNames(local, item.names)) return local;

  let stripped = item.caption;
  for (const re of TRIGGER_PATTERNS) stripped = stripped.replace(re, "");
  stripped = stripped
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

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
              "The image model refused. Soften each caption using THIS round's " +
              "strategy. Keep labels/names verbatim.\n" +
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
  /** When true (refusal path), always rewrite — never skip via the keyword heuristic. */
  force?: boolean;
};

/**
 * Rewrite each caption at the given escalation level.
 * Prefer deterministic local soften (distinct per level); LLM fills gaps.
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
    // Always prefer the deterministic level-specific local softener first.
    const local = localSoften(it.caption, level, it.names);
    if (local && local !== it.caption.trim()) return local;
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
        (!spicy || withNames !== original) &&
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
    finalResults[i] =
      localSoften(items[i].caption, level, items[i].names) ??
      synthesizeFallback(items[i]);
  });

  return finalResults.map((r, i) => {
    let result = r ?? synthesizeFallback(items[i]);
    result = ensureNamesPresent(result, items[i].names);
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
