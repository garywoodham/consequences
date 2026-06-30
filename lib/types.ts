export type GamePhase = "lobby" | "writing" | "reveal";

export type Player = {
  id: string;
  name: string;
  avatarUrl?: string;
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

export type StoryPanel = {
  caption: string;
  imageUrl?: string;
};

export type Story = {
  id: string;
  lines: StoryLine[];
  prose: string;
  panels?: StoryPanel[];
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
  | { type: "play-again" };

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
