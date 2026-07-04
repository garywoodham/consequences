"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "./PlayerAvatar";

type PlayerNamePickerProps = {
  players: Player[];
  currentPlayerId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PlayerNamePicker({
  players,
  currentPlayerId,
  value,
  onChange,
  placeholder,
}: PlayerNamePickerProps) {
  const [mode, setMode] = useState<"player" | "manual">("player");
  // Everyone is selectable, including yourself.
  const selectablePlayers = players;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("player")}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            mode === "player" ? "bg-violet-600 text-white" : "bg-white/10 text-white/70"
          }`}
        >
          Pick a player
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            mode === "manual" ? "bg-violet-600 text-white" : "bg-white/10 text-white/70"
          }`}
        >
          Type a name
        </button>
      </div>

      {mode === "player" ? (
        <div className="grid gap-2">
          {selectablePlayers.length === 0 ? (
            <p className="text-sm text-white/60">No players yet — type a name instead.</p>
          ) : (
            selectablePlayers.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => onChange(player.name)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                  value === player.name
                    ? "border-violet-400 bg-violet-600/30"
                    : "border-white/15 bg-white/5 hover:bg-white/10"
                }`}
              >
                <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />
                <span className="text-sm text-white">
                  {player.name}
                  {player.id === currentPlayerId && (
                    <span className="ml-1 text-white/50">(you)</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter a name..."}
        />
      )}
    </div>
  );
}
