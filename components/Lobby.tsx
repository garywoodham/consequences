"use client";

import { Check, Copy, Crown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { GameState } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

type LobbyProps = {
  state: GameState;
  currentPlayerId: string;
  onStart: () => void;
  error?: string | null;
};

export function Lobby({ state, currentPlayerId, onStart, error }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === currentPlayerId;
  const connectedCount = state.players.filter((p) => p.connected).length;

  async function copyCode() {
    await navigator.clipboard.writeText(state.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardTitle>Waiting in the lobby</CardTitle>
      <CardDescription className="mt-1 mb-4">
        Share the room code so friends can join
      </CardDescription>

      <div className="mb-6 flex items-center justify-center gap-3">
        <div className="rounded-2xl bg-white/10 px-8 py-4 text-center">
          <p className="text-xs uppercase tracking-widest text-white/60">Room code</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-white">{state.roomCode}</p>
        </div>
        <Button variant="secondary" size="icon" onClick={copyCode} aria-label="Copy room code">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-white/80">
          Players ({connectedCount})
        </p>
        <div className="space-y-2">
          {state.players.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <PlayerAvatar name={player.name} avatarUrl={player.avatarUrl} />
              <span className="flex-1 text-sm text-white">{player.name}</span>
              {player.isHost && (
                <span className="flex items-center gap-1 text-xs text-amber-300">
                  <Crown className="h-3 w-3" /> Host
                </span>
              )}
              {!player.connected && (
                <span className="text-xs text-white/40">Offline</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      {isHost ? (
        <Button className="w-full" onClick={onStart} disabled={connectedCount < 2}>
          Start game {connectedCount < 2 && "(need 2+ players)"}
        </Button>
      ) : (
        <p className="text-center text-sm text-white/60">Waiting for the host to start...</p>
      )}
    </Card>
  );
}
