/**
 * Cross-panel visual continuity for comic generation.
 *
 * If a character becomes naked / covered / in underwear (etc.) in an earlier
 * panel, that state is remembered and injected into later panels when they
 * reappear — unless the new caption introduces a different appearance for them.
 *
 * States are stored WITHOUT character labels (label-agnostic), then rendered
 * with the current panel's Character N label at inject time. Softening /
 * moderation filters are unchanged; continuity is appended as a separate clause.
 */

export type ContinuityMap = Map<string, string>; // character id → visual state phrase

export function emptyContinuity(): ContinuityMap {
  return new Map();
}

/** Clothing / appearance cues we treat as lasting visual state. */
const STATE_PATTERNS: RegExp[] = [
  /\bseen from the shoulders up\b[^.]{0,80}/i,
  /\bcovering (?:themselves|himself|herself|yourself|myself)\b[^.]{0,60}/i,
  /\bwrapped in a (?:bed)?sheet\b[^.]{0,60}/i,
  /\bwrapped in a towel\b[^.]{0,60}/i,
  /\bwrapped in a (?:fluffy )?bathrobe\b[^.]{0,60}/i,
  /\bin (?:a )?bathrobe\b[^.]{0,40}/i,
  /\bin (?:his|her|their|your) underwear\b[^.]{0,40}/i,
  /\bin underwear\b[^.]{0,40}/i,
  /\bwearing underwear\b[^.]{0,40}/i,
  /\bstanding in their underwear\b[^.]{0,40}/i,
  /\bclothes (?:on the floor|in a pile|nearby|piled)\b[^.]{0,40}/i,
  /\bfully covered\b[^.]{0,40}/i,
  /\btangled under a (?:duvet|blanket|covers?)\b[^.]{0,50}/i,
  /\bcuddled (?:and kissed )?under\b[^.]{0,50}/i,
  /\bcuddled in their underwear\b[^.]{0,40}/i,
  /\b(?:completely |stark |totally )?(?:naked|nude)\b[^.]{0,40}/i,
  /\btopless\b[^.]{0,30}/i,
  /\bbottomless\b[^.]{0,30}/i,
  /\bstripped\b[^.]{0,40}/i,
  /\bin a state of undress\b[^.]{0,40}/i,
  /\bwearing a camisole\b[^.]{0,30}/i,
  /\bgot dressed\b[^.]{0,40}/i,
  /\bput (?:his|her|their|your|the) clothes (?:back )?on\b[^.]{0,40}/i,
  /\bput on (?:a |an |his |her |their |your )?(?:shirt|dress|suit|coat|jacket|robe|gown|uniform|outfit|clothes|jeans|trousers|pants|skirt|sweater|hoodie|towel|bathrobe|bedsheet|sheet)\b[^.]{0,40}/i,
  /\bdressed in\b[^.]{0,50}/i,
  /\bwearing (?:a |an |his |her |their |your )?(?:shirt|dress|suit|coat|jacket|robe|gown|uniform|outfit|clothes|clothing|jeans|trousers|pants|skirt|sweater|hoodie)\b[^.]{0,40}/i,
  /\bfully clothed\b[^.]{0,30}/i,
  /\bclothes (?:back )?on\b[^.]{0,30}/i,
];

/** Joint "they …" undress/clothing states that apply to everyone in the panel. */
const JOINT_STATE_PATTERNS: RegExp[] = [
  /\bthey\b[^.!]{0,60}\b(?:completely |stark |totally )?(?:naked|nude)\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\bin (?:their )?underwear\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\bwrapped in a (?:bed)?sheet\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\bcovering themselves\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\btangled under a (?:duvet|blanket|covers?)\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\bgot dressed\b[^.]{0,40}/i,
  /\bthey\b[^.!]{0,60}\bstripped\b[^.]{0,40}/i,
];

type CastMember = { id: string; name: string; label: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does this caption already introduce a new appearance state for this person? */
export function captionUpdatesAppearance(
  caption: string,
  member: CastMember
): boolean {
  return Boolean(extractStateForMember(caption, member));
}

/**
 * Pull a lasting visual-state phrase for one character from a (possibly
 * label-substituted) caption. Returns a label-agnostic phrase.
 * Only clauses that mention this character by label or real name count —
 * joint "they …" states are handled separately in updateContinuityFromCaption.
 */
export function extractStateForMember(
  caption: string,
  member: CastMember
): string | null {
  const text = caption.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const mentionRe = new RegExp(
    `(?<!\\p{L})(?:${escapeRegExp(member.label)}|${escapeRegExp(member.name)})(?!\\p{L})`,
    "iu"
  );

  const clauses = text.split(/(?<=[.!?])\s+|\s*;\s*|\s*—\s*|\s*,\s+(?=[A-Z])/);

  const candidates: string[] = [];
  for (const clause of clauses) {
    if (!mentionRe.test(clause)) continue;

    for (const pat of STATE_PATTERNS) {
      pat.lastIndex = 0;
      const m = clause.match(pat);
      if (m?.[0]) {
        candidates.push(cleanStatePhrase(m[0], member));
      }
    }
  }

  // Also scan a short window around the name/label.
  if (candidates.length === 0) {
    for (const token of [member.label, member.name]) {
      const windowRe = new RegExp(
        `.{0,40}(?<!\\p{L})${escapeRegExp(token)}(?!\\p{L}).{0,80}`,
        "iu"
      );
      const win = text.match(windowRe)?.[0];
      if (!win) continue;
      for (const pat of STATE_PATTERNS) {
        pat.lastIndex = 0;
        const m = win.match(pat);
        if (m?.[0]) candidates.push(cleanStatePhrase(m[0], member));
      }
    }
  }

  const phrase = candidates.find((c) => c.length > 0);
  return phrase ?? null;
}

/** Extract a joint "they …" appearance state from the caption, if any. */
export function extractJointState(caption: string): string | null {
  const text = caption.replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const pat of JOINT_STATE_PATTERNS) {
    pat.lastIndex = 0;
    const m = text.match(pat);
    if (!m?.[0]) continue;
    const s = m[0]
      .replace(/\s+/g, " ")
      .replace(/^they\s+/i, "")
      .replace(/^(?:are|were|got|both)\s+/i, "")
      .replace(/^[,.\s]+|[,.\s]+$/g, "")
      .trim();
    if (s) return s;
  }
  return null;
}

function cleanStatePhrase(raw: string, member: CastMember): string {
  let s = raw.replace(/\s+/g, " ").trim();
  for (const token of [member.label, member.name]) {
    s = s.replace(
      new RegExp(
        `^(?:${escapeRegExp(token)}\\s*(?:is|was|were|got|said)?\\s*)`,
        "iu"
      ),
      ""
    );
    s = s.replace(
      new RegExp(`(?<!\\p{L})${escapeRegExp(token)}(?!\\p{L})`, "giu"),
      ""
    );
  }
  s = s
    .replace(/^(?:is|was|were|got|and|said)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();

  // Normalize outfit-change verbs into a stable "wearing …" form so later
  // panels read "still wearing a coat" rather than "still put on a coat".
  const putOn = s.match(
    /^put on (?:a |an |his |her |their |your )?(.+?)(?:\s+and\b.*)?$/i
  );
  if (putOn?.[1]) {
    const item = putOn[1].replace(/\s+/g, " ").trim();
    s = /^[aeiou]/i.test(item) ? `wearing an ${item}` : `wearing a ${item}`;
    s = s.replace(/^wearing an (?:his|her|their|your)\b/i, "wearing");
    s = s.replace(/^wearing a (?:his|her|their|your)\b/i, "wearing");
  }

  // Keep bare nudity phrases short ("naked", not "naked at the party").
  const nudeOnly = s.match(
    /^(?:completely |stark |totally )?(naked|nude)\b/i
  );
  if (nudeOnly) s = nudeOnly[0].toLowerCase();

  return s;
}

/**
 * Update continuity from a caption that was (or will be) used for an image.
 * New appearance language for a character replaces their prior state.
 * Joint "they …" states apply to every cast member in this panel.
 */
export function updateContinuityFromCaption(
  continuity: ContinuityMap,
  caption: string,
  cast: CastMember[]
): void {
  const joint = extractJointState(caption);
  if (joint) {
    for (const member of cast) {
      continuity.set(member.id, joint);
    }
  }
  for (const member of cast) {
    const next = extractStateForMember(caption, member);
    if (next) continuity.set(member.id, next);
  }
}

/**
 * Append continuity notes for characters who have prior state that the
 * current caption does NOT override. Uses current panel labels.
 */
export function applyContinuity(
  caption: string,
  cast: CastMember[],
  continuity: ContinuityMap
): { caption: string; notes: string[] } {
  const notes: string[] = [];
  for (const member of cast) {
    const prior = continuity.get(member.id);
    if (!prior) continue;
    if (captionUpdatesAppearance(caption, member)) continue;
    // Joint "they …" in this caption also counts as an override for everyone.
    if (extractJointState(caption)) continue;
    notes.push(`${member.label} is still ${prior}`);
  }
  if (notes.length === 0) return { caption, notes: [] };
  return {
    caption:
      `${caption} (STORY CONTINUITY — keep this visual state from earlier ` +
      `panels unless the scene clearly changes it: ${notes.join("; ")}.)`,
    notes,
  };
}
