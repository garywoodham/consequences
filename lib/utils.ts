import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "";

  const key = "consequences-player-id";

  try {
    let id = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, id);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
