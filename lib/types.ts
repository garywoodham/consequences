export type GamePhase = "lobby" | "writing" | "reveal";

export type Player = {
  id: string;
  name: string;
  avatarUrl?: string;
  /** Cartoon caricature derived from the uploaded photo (Phase 2). */
  caricatureUrl?: string;
  connected: boolean;
  isHost: boolean;
  hasSubmitted: boolean;
};

export type StoryLine = {
  promptId: string;
  promptLabel: string;
  text: string;
  /** The contributor's raw answer formatted as a natural story segment. */
  display: string;
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string;
};

/**
 * How the player photos are stylised into caricatures for the comic:
 * - "faithful"    — stay close to the original photo (low exaggeration)
 * - "balanced"    — moderate, recognisable caricature (default)
 * - "exaggerated" — heavily amplify distinctive features (high harshness)
 * - "flattering"  — enhance attractive features, idealised look
 */
export type CaricatureStyle = "faithful" | "balanced" | "exaggerated" | "flattering";

export const CARICATURE_STYLES: CaricatureStyle[] = [
  "faithful",
  "balanced",
  "exaggerated",
  "flattering",
];

export type ComicCharacter = {
  id: string;
  name: string;
  /** Image used to represent the character (caricature, else avatar). */
  imageUrl?: string;
  /**
   * Detailed physical description generated once up front. This — not the
   * name — is what anchors the character's look in the image prompts, and it's
   * surfaced in the UI for review.
   */
  description?: string;
  /**
   * Where the description came from: "photo" (from an uploaded picture) or
   * "web" (looked up online for a recognised public figure typed as a name).
   */
  descriptionSource?: "photo" | "web";
};

export type PanelImageAttempt = {
  /** raw / raw-retry / local0 / level0 / level1 / level2 / local2 */
  attempt: string;
  ok: boolean;
  /** Human-readable reason when the attempt failed. */
  reason?: string;
  /** Caption variant tried (already name→label substituted for image use). */
  caption?: string;
};

export type StoryPanel = {
  index: number;
  caption: string;
  /** LLM/heuristic-authored prompt describing the scene for an image model. */
  sceneDescription: string;
  characters: ComicCharacter[];
  /** Generated panel illustration (filled when an image provider is configured). */
  imageUrl?: string;
  /**
   * The full text prompt actually sent to the image model for this panel
   * (after safe-rewrite + name→label substitution). Surfaced in the UI so the
   * exact instruction behind each image can be reviewed.
   */
  imagePrompt?: string;
  /**
   * Why this panel has no image (or why generation struggled). Surfaced under
   * the panel when imageUrl is missing, and as a summary when an image was
   * only obtained after retries.
   */
  imageFailureReason?: string;
  /** Per-attempt log so you can see exactly why each try failed. */
  imageAttempts?: PanelImageAttempt[];
  /**
   * Visual state carried forward from earlier panels (e.g. still naked /
   * covering / in underwear) so image progression stays consistent.
   */
  continuityNote?: string;
};

export type ComicStripData = {
  panels: StoryPanel[];
  /** "ai" when illustrated by an image model, "photo" for the no-key fallback. */
  mode: "ai" | "photo";
  /**
   * The full story cast with the feature descriptions passed to the image
   * model (names are NOT sent to the image model, but are kept here so the
   * descriptions can be reviewed against who they belong to in the UI).
   */
  cast?: ComicCharacter[];
};

/**
 * Result of one comic-generation chunk. When `complete` is false the client
 * should call again with `comic` as `previousComic` to resume — cast,
 * caricatures, wardrobe/continuity, and finished panels are reused.
 */
export type ComicBuildResult = {
  comic: ComicStripData;
  complete: boolean;
  /** Panel indexes still missing an image after this chunk. */
  pendingPanelIndexes: number[];
  /** How many panel images were newly generated in this chunk. */
  generatedThisChunk: number;
};

export type Story = {
  id: string;
  lines: StoryLine[];
  prose: string;
  /**
   * The named characters mentioned by name in the story text (typically
   * "Person 1" and "Person 2" from the name prompts). Each carries an avatar
   * if the typed name matched a player in the game — this is what the comic
   * generator uses to draw the right people in each panel.
   */
  characters: ComicCharacter[];
  /** AI-polished version of the prose (when the polish toggle is on). */
  tidyProse?: string;
  comic?: ComicStripData;
};

export type GameState = {
  roomCode: string;
  hostId: string;
  templateId: string;
  /** When true, stories are polished into readable sentences by AI on reveal. */
  tidyEnabled: boolean;
  phase: GamePhase;
  players: Player[];
  submissions: Record<string, Record<string, string>>;
  stories: Story[];
};

export type ClientMessage =
  | {
      type: "join";
      playerId: string;
      name: string;
      avatarUrl?: string;
      isHost?: boolean;
      templateId?: string;
      tidyEnabled?: boolean;
    }
  | { type: "start" }
  | { type: "submit"; answers: Record<string, string> }
  | { type: "play-again" }
  | { type: "seed-sample" }
  | { type: "set-tidy"; stories: { id: string; tidyProse: string }[] };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "error"; message: string };

export const EMPTY_GAME_STATE: GameState = {
  roomCode: "",
  hostId: "",
  templateId: "classic",
  tidyEnabled: false,
  phase: "lobby",
  players: [],
  submissions: {},
  stories: [],
};
