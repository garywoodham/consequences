/**
 * Cross-panel visual continuity for comic generation.
 *
 * Appearance cues (outfits, hats, shoes, nudity, covering, etc.) are remembered
 * per character and injected into later panels when they reappear — unless the
 * new caption replaces that slot (e.g. a new outfit, or "took off the hat").
 *
 * Softening / moderation filters are unchanged; continuity is appended as a
 * separate, forceful clause so the image model keeps the look.
 */

/** character id → (slot → visual phrase, e.g. "wearing a hat") */
export type ContinuityMap = Map<string, Map<string, string>>;

export function emptyContinuity(): ContinuityMap {
  return new Map();
}

type CastMember = { id: string; name: string; label: string };

type Trait = { slot: string; phrase: string };

/** Accessories / garments we can spot even in short dialogue answers. */
const ACCESSORY_ITEMS: Array<{ slot: string; re: RegExp; phrase: string }> = [
  { slot: "hat", re: /\b(?:hats?|caps?|beanies?|fedoras?|berets?|helmets?|headbands?|turbans?|sombreros?|top hats?|cowboy hats?)\b/i, phrase: "wearing a hat" },
  { slot: "glasses", re: /\b(?:glasses|sunglasses|spectacles|shades|eyewear)\b/i, phrase: "wearing glasses" },
  { slot: "shoes", re: /\b(?:shoes|boots|sneakers|trainers|heels|sandals|crocs|slippers|loafers|trainers)\b/i, phrase: "wearing distinctive shoes" },
  { slot: "scarf", re: /\b(?:scar(?:f|ves)|mufflers?)\b/i, phrase: "wearing a scarf" },
  { slot: "tie", re: /\b(?:ties?|bow.?ties?|neckties?)\b/i, phrase: "wearing a tie" },
  { slot: "jewelry", re: /\b(?:necklace|earrings?|bracelet|jewellery|jewelry|rings?|pendant)\b/i, phrase: "wearing jewellery" },
  { slot: "wig", re: /\b(?:wigs?|toupees?)\b/i, phrase: "wearing a wig" },
  { slot: "mask", re: /\b(?:masks?|face.?masks?)\b/i, phrase: "wearing a mask" },
  { slot: "crown", re: /\b(?:crowns?|tiaras?|diadems?)\b/i, phrase: "wearing a crown" },
  { slot: "cape", re: /\b(?:capes?|cloaks?)\b/i, phrase: "wearing a cape" },
  { slot: "apron", re: /\baprons?\b/i, phrase: "wearing an apron" },
  { slot: "watch", re: /\b(?:watches|wristwatch)\b/i, phrase: "wearing a watch" },
];

const OUTFIT_NOUN =
  "shirt|dress|suit|coat|jacket|robe|gown|uniform|outfit|clothes|clothing|jeans|trousers|pants|skirt|sweater|hoodie|tuxedo|blazer|jumper|cardigan|overalls|onesie|costume|leisure suit|tracksuit|swimsuit|bikini|raincoat|poncho|toga|kilt|sari|kimono|armour|armor|sandwich board|tutu|leotard|overalls";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionRe(member: CastMember): RegExp {
  return new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})`,
    "iu"
  );
}

function getTraits(continuity: ContinuityMap, id: string): Map<string, string> {
  let t = continuity.get(id);
  if (!t) {
    t = new Map();
    continuity.set(id, t);
  }
  return t;
}

/** Build a clean "wearing …" phrase from an item description. */
function wearingPhrase(item: string): string {
  let s = item.replace(/\s+/g, " ").replace(/["'“”]/g, "").trim();
  s = s.replace(/^(?:wearing|wore)\s+/i, "").toLowerCase();
  if (!s) return "wearing something distinctive";

  const lastWord = s.split(/\s+/).pop() ?? "";
  const plural =
    /s$/i.test(lastWord) ||
    /^(?:crocs|glasses|sunglasses|jeans|trousers|pants|clothes|overalls)\b/i.test(
      s
    );
  if (plural) s = s.replace(/^(?:a|an)\s+/i, "");

  if (/^(?:a|an|the|his|her|their|your)\b/i.test(s)) return `wearing ${s}`;
  if (plural) return `wearing ${s}`;
  return /^[aeiou]/i.test(s) ? `wearing an ${s}` : `wearing a ${s}`;
}

/** Refine accessory phrase when the caption has a more specific item ("nice fedora"). */
function accessoryPhraseFromMatch(slot: string, fallback: string, text: string): string {
  if (slot === "hat" && /\btop hat\b/i.test(text)) return "wearing a top hat";
  if (slot === "hat" && /\bcowboy hat\b/i.test(text)) return "wearing a cowboy hat";
  if (slot === "shoes" && /\bcrocs\b/i.test(text)) return "wearing crocs";

  const nice = text.match(
    new RegExp(
      `\\b((?:nice|cool|lovely|great|amazing|beautiful|cute|fancy|ridiculous|silly|tiny|huge|giant|pink|red|blue|green|yellow|black|white|gold|silver|sequinned|sequined|sparkly|striped|polka-dot)\\s+)?((?:top |cowboy )?(?:hat|cap|beanie|fedora|beret|helmet|glasses|sunglasses|shoes|boots|sneakers|scarf|tie|wig|mask|crown|cape|apron|watch|tiara)s?)\\b`,
      "i"
    )
  );
  if (nice) {
    const adj = (nice[1] ?? "").trim();
    const item = (nice[2] ?? "").trim();
    return wearingPhrase(adj ? `${adj} ${item}` : item);
  }
  return fallback;
}

/** True when the worn item is only an accessory (not a full outfit). */
function isAccessoryOnlyItem(item: string): boolean {
  const s = item.replace(/\s+/g, " ").trim();
  if (new RegExp(`\\b(?:${OUTFIT_NOUN})\\b`, "i").test(s)) return false;
  return ACCESSORY_ITEMS.some((acc) => acc.re.test(s));
}

/** Traits explicitly tied to this character (wore / wearing / naked / …). */
function extractDirectTraits(caption: string, member: CastMember): Trait[] {
  const text = caption.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const re = mentionRe(member);
  const traits: Trait[] = [];

  // "Character 1 wore a seafoam green leisure suit."
  const woreRe = new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})\\s+wore\\s+([^.!?]+)`,
    "giu"
  );
  for (const m of text.matchAll(woreRe)) {
    const item = (m[1] ?? "").replace(/["'”’]/g, "").trim();
    if (!item || /^(?:nothing|nada|no clothes)\b/i.test(item)) {
      traits.push({ slot: "body", phrase: "naked" });
      continue;
    }
    const phrase = wearingPhrase(item);
    const accessoryHits = ACCESSORY_ITEMS.filter((acc) => acc.re.test(item));
    if (isAccessoryOnlyItem(item) && accessoryHits.length > 0) {
      for (const acc of accessoryHits) {
        traits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, phrase, item),
        });
      }
    } else {
      traits.push({ slot: "outfit", phrase });
      for (const acc of accessoryHits) {
        traits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, acc.phrase, item),
        });
      }
    }
  }

  // "Character 1 was wearing a hat" / "put on a coat"
  const wearingRe = new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})\\s+(?:is |was |were )?(?:wearing|in)\\s+([^.!?,]+)`,
    "giu"
  );
  for (const m of text.matchAll(wearingRe)) {
    const item = (m[1] ?? "").trim();
    if (!item) continue;
    const phrase = wearingPhrase(item);
    const accessoryHits = ACCESSORY_ITEMS.filter((acc) => acc.re.test(item));
    if (isAccessoryOnlyItem(item) && accessoryHits.length > 0) {
      for (const acc of accessoryHits) {
        traits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, phrase, item),
        });
      }
    } else {
      traits.push({ slot: "outfit", phrase });
      for (const acc of accessoryHits) {
        traits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, acc.phrase, item),
        });
      }
    }
  }

  const putOnRe = new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})\\s+put on\\s+([^.!?,]+)`,
    "giu"
  );
  for (const m of text.matchAll(putOnRe)) {
    const item = (m[1] ?? "").replace(/\s+and\b.*/i, "").trim();
    if (!item) continue;
    const phrase = wearingPhrase(item);
    let slotted = false;
    for (const acc of ACCESSORY_ITEMS) {
      if (acc.re.test(item)) {
        traits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, phrase, item),
        });
        slotted = true;
      }
    }
    if (!slotted) traits.push({ slot: "outfit", phrase });
  }

  // Body / covering states near this character.
  const windowRe = new RegExp(
    `.{0,50}(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L}).{0,90}`,
    "iu"
  );
  const win = text.match(windowRe)?.[0] ?? (re.test(text) ? text : "");
  if (win) {
    const bodyPatterns: Array<{ slot: string; re: RegExp; phrase: string }> = [
      { slot: "body", re: /\b(?:completely |stark |totally )?(?:naked|nude)\b/i, phrase: "naked" },
      { slot: "body", re: /\btopless\b/i, phrase: "topless" },
      { slot: "body", re: /\bbottomless\b/i, phrase: "bottomless" },
      { slot: "body", re: /\bstripped\b/i, phrase: "stripped" },
      { slot: "body", re: /\bin (?:his|her|their|your )?underwear\b/i, phrase: "in their underwear" },
      { slot: "body", re: /\bstanding in their underwear\b/i, phrase: "standing in their underwear" },
      { slot: "body", re: /\bseen from the shoulders up\b/i, phrase: "seen from the shoulders up, covering themselves" },
      { slot: "body", re: /\bcovering (?:themselves|himself|herself)\b/i, phrase: "covering themselves" },
      { slot: "body", re: /\bwrapped in a (?:bed)?sheet\b/i, phrase: "wrapped in a bedsheet" },
      { slot: "body", re: /\bwrapped in a towel\b/i, phrase: "wrapped in a towel" },
      { slot: "body", re: /\b(?:wrapped in a )?(?:fluffy )?bathrobe\b|\bin (?:a )?bathrobe\b/i, phrase: "in a bathrobe" },
      { slot: "body", re: /\btangled under a (?:duvet|blanket|covers?)\b/i, phrase: "tangled under a duvet, covered up" },
      { slot: "body", re: /\bfully clothed\b|\bgot dressed\b|\bclothes (?:back )?on\b/i, phrase: "fully clothed" },
      {
        slot: "outfit",
        re: new RegExp(
          `\\b(?:wearing|dressed in) (?:a |an |his |her |their |your )?(?:${OUTFIT_NOUN})\\b`,
          "i"
        ),
        phrase: "wearing clothes from earlier",
      },
    ];
    for (const bp of bodyPatterns) {
      if (bp.re.test(win)) {
        const m = win.match(bp.re);
        if (bp.slot === "outfit" && m?.[0]) {
          traits.push({
            slot: "outfit",
            phrase: m[0].toLowerCase().startsWith("wearing")
              ? m[0]
              : m[0].toLowerCase().startsWith("dressed")
                ? m[0].replace(/^dressed in/i, "wearing")
                : bp.phrase,
          });
        } else {
          traits.push({ slot: bp.slot, phrase: bp.phrase });
        }
      }
    }
    // Accessories are NOT taken from a loose name-window scan — dialogue like
    // "Character 1 said nice hat" would wrongly put the hat on the speaker.
    // Hats/shoes/etc. come from wore/wearing/put-on clauses or compliment routing.
  }

  // Removals clear slots.
  const takeOffRe = new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})[^.]{0,40}\\b(?:took off|removed|ditched|lost)\\b[^.]{0,40}`,
    "iu"
  );
  const takeOff = text.match(takeOffRe)?.[0];
  if (takeOff) {
    for (const acc of ACCESSORY_ITEMS) {
      if (acc.re.test(takeOff)) {
        traits.push({ slot: acc.slot, phrase: `__clear__` });
      }
    }
    if (/\b(?:coat|jacket|clothes|outfit|shirt|dress|suit)\b/i.test(takeOff)) {
      traits.push({ slot: "outfit", phrase: `__clear__` });
    }
  }

  return traits;
}

/**
 * Dialogue compliments like "Character 1 said nice hat" usually describe the
 * OTHER person's look (the addressee). Returns traits for those addressees.
 */
function extractComplimentTraits(
  caption: string,
  cast: CastMember[]
): Map<string, Trait[]> {
  const out = new Map<string, Trait[]>();
  const text = caption.replace(/\s+/g, " ").trim();
  if (!text || cast.length === 0) return out;

  for (const speaker of cast) {
    // Match "X said …" / "X replied …" including quoted answers and
    // punctuation ("Nice hat!"). Speech runs to the sentence end.
    const saidRe = new RegExp(
      `(?<!\\p{L})(?:${escapeRegExp(speaker.label)}|${escapeRegExp(speaker.name)})(?!\\p{L})\\s+(?:said|replied|whispered|shouted|yelled|asked|answered)\\s+(.+?)(?=(?:[.!?](?:\\s|$))|$)`,
      "giu"
    );
    for (const m of text.matchAll(saidRe)) {
      const speech = (m[1] ?? "").replace(/["'“”‘’]/g, " ").trim();
      if (!speech) continue;

      const traits: Trait[] = [];
      for (const acc of ACCESSORY_ITEMS) {
        if (acc.re.test(speech)) {
          traits.push({
            slot: acc.slot,
            phrase: accessoryPhraseFromMatch(acc.slot, acc.phrase, speech),
          });
        }
      }
      // "nice suit" / "love the jacket" in dialogue
      const outfitSaid = speech.match(
        new RegExp(
          `\\b((?:nice|cool|lovely|great|amazing|beautiful|cute|fancy)\\s+)?(?:${OUTFIT_NOUN})\\b`,
          "i"
        )
      );
      if (outfitSaid && traits.length === 0) {
        const item = outfitSaid[0].replace(/^(?:nice|cool|lovely|great|amazing|beautiful|cute|fancy)\s+/i, "");
        traits.push({
          slot: "outfit",
          phrase: /^[aeiou]/i.test(item) ? `wearing an ${item}` : `wearing a ${item}`,
        });
      }
      if (traits.length === 0) continue;

      const others = cast.filter((c) => c.id !== speaker.id);
      const targets = others.length > 0 ? others : [speaker];
      for (const t of targets) {
        const list = out.get(t.id) ?? [];
        list.push(...traits);
        out.set(t.id, list);
      }
    }
  }

  // Bare fragment like "Nice hat!" with no speaker/wearer yet — apply to everyone
  // in the panel rather than dropping the prop. Skip if anyone already has a
  // direct wore/wearing trait so we don't put Person1's hat on Person2 too.
  if (out.size === 0) {
    const anyoneWearing = cast.some(
      (m) => extractDirectTraits(text, m).length > 0
    );
    if (!anyoneWearing) {
      const bareTraits: Trait[] = [];
      for (const acc of ACCESSORY_ITEMS) {
        if (!acc.re.test(text)) continue;
        const complimenty =
          /\b(?:nice|cool|lovely|great|amazing|beautiful|cute|fancy|love (?:your|the|that)|check out (?:your|the|that))\b/i.test(
            text
          ) || text.length < 80;
        if (!complimenty) continue;
        bareTraits.push({
          slot: acc.slot,
          phrase: accessoryPhraseFromMatch(acc.slot, acc.phrase, text),
        });
      }
      if (bareTraits.length > 0) {
        for (const member of cast) {
          out.set(member.id, [...bareTraits]);
        }
      }
    }
  }

  return out;
}

function extractJointTraits(caption: string): Trait[] {
  const text = caption.replace(/\s+/g, " ").trim();
  const traits: Trait[] = [];
  if (/\bthey\b[^.!]{0,60}\b(?:completely |stark |totally )?(?:naked|nude)\b/i.test(text)) {
    traits.push({ slot: "body", phrase: "naked" });
  }
  if (/\bthey\b[^.!]{0,60}\bin (?:their )?underwear\b/i.test(text)) {
    traits.push({ slot: "body", phrase: "in their underwear" });
  }
  if (/\bthey\b[^.!]{0,60}\bwrapped in a (?:bed)?sheet\b/i.test(text)) {
    traits.push({ slot: "body", phrase: "wrapped in a bedsheet" });
  }
  if (/\bthey\b[^.!]{0,60}\bcovering themselves\b/i.test(text)) {
    traits.push({ slot: "body", phrase: "covering themselves" });
  }
  if (/\bthey\b[^.!]{0,60}\bgot dressed\b/i.test(text)) {
    traits.push({ slot: "body", phrase: "fully clothed" });
  }
  for (const acc of ACCESSORY_ITEMS) {
    if (new RegExp(`\\bthey\\b[^.!]{0,60}${acc.re.source}`, "i").test(text)) {
      traits.push({
        slot: acc.slot,
        phrase: accessoryPhraseFromMatch(acc.slot, acc.phrase, text),
      });
    }
  }
  return traits;
}

function applyTraitsToMember(
  continuity: ContinuityMap,
  memberId: string,
  traits: Trait[]
): void {
  if (traits.length === 0) return;
  const bag = getTraits(continuity, memberId);
  for (const t of traits) {
    if (t.phrase === "__clear__") {
      bag.delete(t.slot);
      continue;
    }
    bag.set(t.slot, t.phrase);
    // Naked / covering clears normal clothes, but keeps accessories (hat on a
    // naked person is classic Consequences comedy).
    if (
      t.slot === "body" &&
      /naked|nude|topless|bottomless|stripped|underwear|covering|bedsheet|towel|bathrobe|duvet|undress/i.test(
        t.phrase
      )
    ) {
      bag.delete("outfit");
    }
    if (t.slot === "body" && t.phrase === "fully clothed") {
      // clothed replaces undress body slot
    }
    if (t.slot === "outfit") {
      // A new outfit replaces undress body state.
      const body = bag.get("body");
      if (
        body &&
        /naked|nude|topless|bottomless|stripped|underwear|covering|bedsheet|towel|bathrobe|duvet/i.test(
          body
        )
      ) {
        bag.delete("body");
      }
    }
  }
}

/** @deprecated kept for tests — true if this caption sets any trait for the member. */
export function captionUpdatesAppearance(
  caption: string,
  member: CastMember
): boolean {
  return extractDirectTraits(caption, member).length > 0;
}

/** @deprecated kept for tests */
export function extractStateForMember(
  caption: string,
  member: CastMember
): string | null {
  const traits = extractDirectTraits(caption, member);
  return traits[0]?.phrase ?? null;
}

/** @deprecated kept for tests */
export function extractJointState(caption: string): string | null {
  return extractJointTraits(caption)[0]?.phrase ?? null;
}

/**
 * Update continuity from a caption that was (or will be) used for an image.
 */
export function updateContinuityFromCaption(
  continuity: ContinuityMap,
  caption: string,
  cast: CastMember[]
): void {
  const joint = extractJointTraits(caption);
  if (joint.length > 0) {
    for (const member of cast) {
      applyTraitsToMember(continuity, member.id, joint);
    }
  }

  const compliments = extractComplimentTraits(caption, cast);
  for (const [id, traits] of compliments) {
    applyTraitsToMember(continuity, id, traits);
  }

  for (const member of cast) {
    applyTraitsToMember(
      continuity,
      member.id,
      extractDirectTraits(caption, member)
    );
  }
}

/** Current wardrobe/body trait phrases for one character. */
export function traitPhrasesFor(
  continuity: ContinuityMap,
  id: string
): string[] {
  const bag = continuity.get(id);
  if (!bag || bag.size === 0) return [];
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const [slot, phrase] of bag) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    if (
      slot === "outfit" &&
      [...bag.entries()].some(
        ([s, p]) => s !== "outfit" && p.toLowerCase() === key
      )
    ) {
      continue;
    }
    seen.add(key);
    phrases.push(phrase);
  }
  return phrases;
}

/**
 * Bake continuity into the character FEATURE description used by the image
 * model's CHARACTER GUIDE. This is what actually sticks across panels —
 * scene footnotes alone are too easy for the model to ignore.
 */
export function descriptionWithContinuity(
  baseDescription: string,
  continuity: ContinuityMap,
  id: string
): string {
  const traits = traitPhrasesFor(continuity, id);
  if (traits.length === 0) return baseDescription;
  const wardrobe = traits.join("; ");
  const base = baseDescription.trim().replace(/\.\s*$/, "");
  const suffix =
    `STORY WARDROBE — must appear in EVERY panel exactly like this: ${wardrobe}`;
  return base ? `${base}. ${suffix}` : suffix;
}

/** Build a description map with wardrobe baked into every character that has traits. */
export function descriptionsWithContinuity(
  baseDescriptions: Map<string, string>,
  continuity: ContinuityMap,
  ids: Iterable<string>
): Map<string, string> {
  const live = new Map<string, string>();
  for (const id of ids) {
    live.set(
      id,
      descriptionWithContinuity(baseDescriptions.get(id) ?? "", continuity, id)
    );
  }
  // Keep any base entries not in ids.
  for (const [id, desc] of baseDescriptions) {
    if (!live.has(id)) live.set(id, desc);
  }
  return live;
}

/** Human-readable wardrobe lines for UI / logs. */
export function wardrobeNotes(
  continuity: ContinuityMap,
  cast: CastMember[]
): string[] {
  const notes: string[] = [];
  for (const member of cast) {
    const traits = traitPhrasesFor(continuity, member.id);
    if (traits.length === 0) continue;
    notes.push(`${member.label} ${traits.join(", and ")}`);
  }
  return notes;
}

/**
 * Append continuity notes for prior traits the current caption does not replace.
 */
export function applyContinuity(
  caption: string,
  cast: CastMember[],
  continuity: ContinuityMap
): { caption: string; notes: string[] } {
  const notes: string[] = [];

  const compliments = extractComplimentTraits(caption, cast);
  const joint = extractJointTraits(caption);

  for (const member of cast) {
    const prior = continuity.get(member.id);
    if (!prior || prior.size === 0) continue;

    const incoming = [
      ...extractDirectTraits(caption, member),
      ...(compliments.get(member.id) ?? []),
    ];
    const incomingSlots = new Set([
      ...incoming.map((t) => t.slot),
      ...joint.map((t) => t.slot),
    ]);

    const carry: string[] = [];
    const seen = new Set<string>();
    for (const [slot, phrase] of prior) {
      if (incomingSlots.has(slot)) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      // Drop outfit phrase when it duplicates an accessory phrase ("wearing a hat").
      if (
        slot === "outfit" &&
        [...prior.entries()].some(
          ([s, p]) => s !== "outfit" && p.toLowerCase() === key
        )
      ) {
        continue;
      }
      seen.add(key);
      carry.push(phrase);
    }
    if (carry.length === 0) continue;

    notes.push(`${member.label} is still ${carry.join(", and still ")}`);
  }

  if (notes.length === 0) return { caption, notes: [] };

  return {
    caption:
      `${caption} (CRITICAL VISUAL CONTINUITY FROM EARLIER PANELS — draw these ` +
      `exact same props/clothes on the same characters; do not drop or change them: ` +
      `${notes.join("; ")}.)`,
    notes,
  };
}
