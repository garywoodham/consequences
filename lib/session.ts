export type GameSession = {
  playerId: string;
  name: string;
  avatarUrl?: string;
  isHost: boolean;
  templateId?: string;
  roomCode: string;
};

const SESSION_KEY = "consequences-session";

function canUseStorage(): boolean {
  try {
    const test = "__storage_test__";
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function saveSession(session: GameSession): void {
  const data = JSON.stringify(session);
  if (canUseStorage()) {
    sessionStorage.setItem(SESSION_KEY, data);
  }
  try {
    localStorage.setItem(SESSION_KEY, data);
  } catch {
    // ignore
  }
}

export function loadSession(roomId: string): GameSession | null {
  if (typeof window === "undefined") return null;

  const sources = [sessionStorage.getItem(SESSION_KEY), localStorage.getItem(SESSION_KEY)];

  for (const raw of sources) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as GameSession;
      if (parsed.roomCode.toUpperCase() === roomId.toUpperCase()) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}
