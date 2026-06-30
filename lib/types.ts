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

export type ComicCharacter = {
  id: string;
  name: string;
  /** Image used to represent the character (caricature, else avatar). */
  imageUrl?: string;
};

export type StoryPanel = {
  index: number;
  caption: string;
  /** LLM/heuristic-authored prompt describing the scene for an image model. */
  sceneDescription: string;
  characters: ComicCharacter[];
  /** Generated panel illustration (filled when an image provider is configured). */
  imageUrl?: string;
};

export type ComicStripData = {
  panels: StoryPanel[];
  /** "ai" when illustrated by an image model, "photo" for the no-key fallback. */
  mode: "ai" | "photo";
};

export type Story = {
  id: string;
  lines: StoryLine[];
  prose: string;
  comic?: ComicStripData;
};

export type GameState = {
  roomCode: string;
  hostId: string;
  templateId: string;
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
    }
  | { type: "start" }
  | { type: "submit"; answers: Record<string, string> }
  | { type: "play-again" }
  | { type: "seed-sample" };

export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "error"; message: string };

export const EMPTY_GAME_STATE: GameState = {
  roomCode: "",
  hostId: "",
  templateId: "classic",
  phase: "lobby",
  players: [],
  submissions: {},
  stories: [],
};
