// Client-safe (no server deps): recommends which image engine suits a story.
import type { ImageProvider, Story } from "./types";

/**
 * Content that OpenAI's image moderation reliably refuses but the FLUX
 * fallback ladder handles: nudity, sexual situations, hard profanity and
 * general filth. Whole-word stems, checked case-insensitively.
 */
const SPICY_PATTERNS: RegExp[] = [
  /\bnaked\b/i,
  /\bnud(?:e|ity|ist)\b/i,
  /\bundress(?:ed|ing)?\b/i,
  /\bstrip(?:ped|ping|per|s)?\b/i,
  /\btopless\b/i,
  /\bbottomless\b/i,
  /\bskinny[- ]?dip(?:ped|ping)?\b/i,
  /\bsex(?:y|ual|ually)?\b/i,
  /\bshag(?:ged|ging)?\b/i,
  /\bbonk(?:ed|ing)?\b/i,
  /\borg(?:y|ies)\b/i,
  /\bthreesome\b/i,
  /\bone[- ]night stand\b/i,
  /\blingerie\b/i,
  /\bknickers\b/i,
  /\bunderwear\b/i,
  /\bunderpants\b/i,
  /\bthong\b/i,
  /\bbra\b/i,
  /\bboobs?\b/i,
  /\bbreasts?\b/i,
  /\bnipples?\b/i,
  /\bbums?\b/i,
  /\bbuttocks?\b/i,
  /\barse\b/i,
  /\bass\b/i,
  /\bbollocks\b/i,
  /\bwilly\b/i,
  /\bpenis\b/i,
  /\bvagina\b/i,
  /\bgenitals?\b/i,
  /\bcrotch\b/i,
  /\bcondoms?\b/i,
  /\bhorny\b/i,
  /\bkinky\b/i,
  /\bspank(?:ed|ing)?\b/i,
  /\bdominatrix\b/i,
  /\bbrothel\b/i,
  /\bhookers?\b/i,
  /\bprostitutes?\b/i,
  /\bfetish\b/i,
  /\bbondage\b/i,
  /\bgrop(?:e|ed|ing)\b/i,
  /\bmoan(?:ed|ing)?\b/i,
  /\bwank(?:er|ed|ing)?\b/i,
  /\bf[u*]ck/i,
  /\bshit(?:e|ty|ting)?\b/i,
  /\bpiss(?:ed|ing)?\b/i,
  /\bturds?\b/i,
  /\bvomit(?:ed|ing)?\b/i,
];

export type ProviderRecommendation = {
  provider: ImageProvider;
  /** Short human-readable explanation shown next to the engine toggle. */
  reason: string;
  /** The matched words that drove a "flux" recommendation (deduped). */
  matches: string[];
};

/** Pick the engine most likely to draw this story without refusals. */
export function recommendImageProvider(story: Story): ProviderRecommendation {
  const text = [
    story.prose,
    story.tidyProse ?? "",
    ...story.lines.map((l) => l.display),
  ]
    .join(" ")
    .toLowerCase();

  const matches: string[] = [];
  for (const pattern of SPICY_PATTERNS) {
    const m = text.match(pattern);
    if (m && !matches.includes(m[0])) matches.push(m[0]);
  }

  if (matches.length > 0) {
    const shown = matches.slice(0, 3).join('", "');
    return {
      provider: "flux",
      reason:
        `This story gets spicy ("${shown}"${
          matches.length > 3 ? ", …" : ""
        }) — FLUX's permissive fallbacks can draw scenes OpenAI refuses.`,
      matches,
    };
  }

  return {
    provider: "openai",
    reason:
      "This story looks tame — OpenAI gives the strongest character likenesses.",
    matches,
  };
}
