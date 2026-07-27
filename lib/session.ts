export type GameSession = {
  playerId: string;
  name: string;
  avatarUrl?: string;
  isHost: boolean;
  templateId?: string;
  roomCode: string;
  /** When true, the room is auto-populated with sample players + stories. */
  sample?: boolean;
  /** Host preference: polish story wording with AI on reveal. */
  tidyEnabled?: boolean;
  /**
   * When true, the answer form highlights preset famous-name fills and sample
   * games draw from that library by default.
   */
  usePresets?: boolean;
};

const SESSION_KEY = "consequences-session";

export function saveSession(session: GameSession): void {
  const data = JSON.stringify(session);
  // sessionStorage is per-tab, so multiple players can test from different tabs
  try {
    sessionStorage.setItem(SESSION_KEY, data);
  } catch {
    // ignore
  }
}

export function loadSession(roomId: string): GameSession | null {
  if (typeof window === "undefined") return null;

  // Only read from sessionStorage — each tab/player keeps their own session
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GameSession;
    if (parsed.roomCode.toUpperCase() === roomId.toUpperCase()) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}
