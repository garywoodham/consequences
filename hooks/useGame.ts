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

const BUILD_TIME_HOST = (process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/$/, "");

const MISSING_HOST_MESSAGE =
  "Multiplayer server not configured. On Vercel, deploy PartyKit (`npm run deploy:party`) and set NEXT_PUBLIC_PARTYKIT_HOST to your *.partykit.dev host, then redeploy.";

export function useGame({ roomId, session }: UseGameOptions) {
  const [state, setState] = useState<GameState>(EMPTY_GAME_STATE);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // Resolve the PartyKit host at runtime so a changing preview URL doesn't
  // require rebuilding. Falls back to the build-time env (used on Vercel).
  const [partyHost, setPartyHost] = useState<string>(BUILD_TIME_HOST);
  const [hostResolved, setHostResolved] = useState(Boolean(BUILD_TIME_HOST));
  const joinedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { partyHost?: string } | null) => {
        if (cancelled) return;
        const host = (data?.partyHost ?? "").trim();
        if (host && host !== partyHost) {
          setPartyHost(host);
        } else if (!host && !BUILD_TIME_HOST) {
          setPartyHost("");
        }
        setHostResolved(true);
      })
      .catch(() => {
        if (!cancelled) setHostResolved(true);
      });
    return () => {
      cancelled = true;
    };
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hostResolved) return;
    if (!partyHost) {
      setConnectionError(MISSING_HOST_MESSAGE);
      setConnected(false);
      return;
    }
    setConnectionError(null);
  }, [hostResolved, partyHost]);

  // Surface a stuck-connecting state instead of amber forever.
  useEffect(() => {
    if (!partyHost || connected || connectionError) return;
    const timer = window.setTimeout(() => {
      setConnectionError(
        `Could not reach the game server at ${partyHost}. Check NEXT_PUBLIC_PARTYKIT_HOST on Vercel and that PartyKit is deployed.`
      );
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [partyHost, connected, connectionError]);

  const socket = usePartySocket({
    host: partyHost || "127.0.0.1:9", // dummy; kept disabled when host missing
    room: roomId.toLowerCase(),
    enabled: Boolean(roomId) && Boolean(partyHost),
    onOpen() {
      setConnected(true);
      setConnectionError(null);
    },
    onClose() {
      setConnected(false);
      joinedRef.current = false;
    },
    onError() {
      if (partyHost) {
        setConnectionError(
          `Could not reach the game server at ${partyHost}. Deploy PartyKit and set NEXT_PUBLIC_PARTYKIT_HOST on Vercel.`
        );
      }
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
    connectionError,
    partyHost,
    startGame,
    submitAnswers,
    playAgain,
    submitTidy,
  };
}
