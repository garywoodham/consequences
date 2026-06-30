"use client";

import { useSyncExternalStore, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Lobby } from "@/components/Lobby";
import { PromptForm } from "@/components/PromptForm";
import { StoryReveal } from "@/components/StoryReveal";
import { useGame } from "@/hooks/useGame";
import { getTemplateById } from "@/lib/prompts";
import {
  getServerSessionSnapshot,
  getSessionSnapshot,
  subscribeToSession,
} from "@/lib/session-store";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = String(params.roomId ?? "").toUpperCase();
  const session = useSyncExternalStore(
    subscribeToSession,
    () => getSessionSnapshot(roomId),
    getServerSessionSnapshot
  );

  useEffect(() => {
    if (session === null && roomId) {
      const timer = setTimeout(() => {
        if (!getSessionSnapshot(roomId)) {
          router.replace("/");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [session, roomId, router]);

  const { state, error, connected, startGame, submitAnswers, playAgain } = useGame({
    roomId,
    session,
  });

  if (!session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-white/60">
        Loading game...
      </div>
    );
  }

  const template = getTemplateById(state.templateId || session.templateId || "classic");
  const isHost = session.playerId === state.hostId;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-8">
      <div className="text-center">
        <p className="text-sm text-white/60">
          {connected ? "Connected" : "Connecting..."} · {template.name} · {state.players.length} players
        </p>
      </div>

      {state.phase === "lobby" && (
        <Lobby
          state={{ ...state, roomCode: state.roomCode || roomId }}
          currentPlayerId={session.playerId}
          onStart={startGame}
          error={error}
        />
      )}

      {state.phase === "writing" && (
        <PromptForm
          state={state}
          currentPlayerId={session.playerId}
          onSubmit={submitAnswers}
        />
      )}

      {state.phase === "reveal" && (
        <StoryReveal
          state={state}
          isHost={isHost}
          onPlayAgain={playAgain}
        />
      )}
    </div>
  );
}
