import type { GameSession } from "./session";
import { loadSession } from "./session";

let cachedRoomId = "";
let cachedSerialized = "";
let cachedSession: GameSession | null = null;

export function getSessionSnapshot(roomId: string): GameSession | null {
  const session = roomId ? loadSession(roomId) : null;
  const serialized = session ? JSON.stringify(session) : "";

  if (roomId === cachedRoomId && serialized === cachedSerialized) {
    return cachedSession;
  }

  cachedRoomId = roomId;
  cachedSerialized = serialized;
  cachedSession = session;
  return session;
}

export function getServerSessionSnapshot(): null {
  return null;
}

export function subscribeToSession(): () => void {
  return () => {};
}
