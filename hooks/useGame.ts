"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import usePartySocket from "partysocket/react";
import type { ClientMessage, GameState, ServerMessage } from "@/lib/types";
import { EMPTY_GAME_STATE } from "@/lib/types";
import type { GameSession } from "@/lib/session";

type UseGameOptions = {
  roomId: string;
  session: GameSession | null;
};

const BUILD_TIME_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "";

export function useGame({ roomId, session }: UseGameOptions) {
  const [state, setState] = useState<GameState>(EMPTY_GAME_STATE);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // Resolve the PartyKit host at runtime so a changing preview URL doesn't
  // require rebuilding. Falls back to the build-time env (used on Vercel).
  const [partyHost, setPartyHost] = useState<string>(BUILD_TIME_HOST);
  const joinedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { partyHost?: string } | null) => {
        if (!cancelled && data?.partyHost && data.partyHost !== partyHost) {
          setPartyHost(data.partyHost);
        }
      })
      .catch(() => {
        // Keep the build-time fallback if the config fetch fails.
      });
    return () => {
      cancelled = true;
    };
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const socket = usePartySocket({
    host: partyHost || "localhost:1999",
    room: roomId.toLowerCase(),
    enabled: Boolean(roomId) && Boolean(partyHost || BUILD_TIME_HOST),
    onOpen() {
      setConnected(true);
    },
    onClose() {
      setConnected(false);
      joinedRef.current = false;
    },
    onMessage(event) {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === "state") {
        setState(msg.state);
        setError(null);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    },
  });

  useEffect(() => {
    if (!session || !connected || joinedRef.current) return;

    joinedRef.current = true;
    socket.send(
      JSON.stringify({
        type: "join",
        playerId: session.playerId,
        name: session.name,
        avatarUrl: session.avatarUrl,
        isHost: session.isHost,
        templateId: session.templateId,
        tidyEnabled: session.tidyEnabled,
      } satisfies ClientMessage)
    );

    // Sample game: immediately populate players + stories so it lands on the
    // reveal screen. The server ignores this once the room leaves the lobby.
    if (session.sample) {
      socket.send(JSON.stringify({ type: "seed-sample" } satisfies ClientMessage));
    }
  }, [session, connected, socket]);

  const send = useCallback(
    (message: ClientMessage) => {
      socket.send(JSON.stringify(message));
    },
    [socket]
  );

  const startGame = useCallback(() => send({ type: "start" }), [send]);
  const submitAnswers = useCallback(
    (answers: Record<string, string>) => send({ type: "submit", answers }),
    [send]
  );
  const playAgain = useCallback(() => send({ type: "play-again" }), [send]);
  const submitTidy = useCallback(
    (tidied: { id: string; tidyProse: string }[]) =>
      send({ type: "set-tidy", stories: tidied }),
    [send]
  );

  return {
    state,
    error,
    connected,
    startGame,
    submitAnswers,
    playAgain,
    submitTidy,
  };
}
