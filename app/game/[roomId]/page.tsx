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

  const {
    state,
    error,
    connected,
    connectionError,
    partyHost,
    startGame,
    submitAnswers,
    playAgain,
    submitTidy,
  } = useGame({
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
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => {
            try {
              sessionStorage.removeItem("consequences-session");
            } catch {
              // ignore
            }
            window.location.href = "/";
          }}
          className="text-sm text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
        >
          Leave game
        </button>
        <p className="text-sm text-white/60">
          <span
            className={
              connected
                ? "text-emerald-300"
                : connectionError
                  ? "text-rose-300"
                  : "text-amber-300"
            }
          >
            {connected
              ? "Connected"
              : connectionError
                ? "Connection failed"
                : "Connecting..."}
          </span>{" "}
          · {template.name} · {state.players.length} players
        </p>
      </div>

      {connectionError && !connected && (
        <div
          className="rounded-2xl border border-rose-400/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-100"
          role="alert"
        >
          <p className="font-medium">Can&apos;t reach the lobby server</p>
          <p className="mt-1 text-rose-100/80">{connectionError}</p>
          {partyHost ? (
            <p className="mt-2 font-mono text-xs text-rose-100/60">Host: {partyHost}</p>
          ) : null}
        </div>
      )}

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
          usePresets={session.usePresets !== false}
        />
      )}

      {state.phase === "reveal" && (
        <StoryReveal
          state={state}
          isHost={isHost}
          onPlayAgain={playAgain}
          onSubmitTidy={submitTidy}
        />
      )}
    </div>
  );
}
