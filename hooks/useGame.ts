"use client";

import { useCallback, useEffect, useState } from "react";
import usePartySocket from "partysocket/react";
import type { ClientMessage, GameState, ServerMessage } from "@/lib/types";
import { EMPTY_GAME_STATE } from "@/lib/types";

type Session = {
  playerId: string;
  name: string;
  avatarUrl?: string;
  isHost: boolean;
  templateId?: string;
  roomCode: string;
};

type UseGameOptions = {
  roomId: string;
  session: Session | null;
};

export function useGame({ roomId, session }: UseGameOptions) {
  const [state, setState] = useState<GameState>(EMPTY_GAME_STATE);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

  const socket = usePartySocket({
    host,
    room: roomId.toLowerCase(),
    onOpen() {
      setConnected(true);
    },
    onClose() {
      setConnected(false);
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

  const send = useCallback(
    (message: ClientMessage) => {
      socket.send(JSON.stringify(message));
    },
    [socket]
  );

  useEffect(() => {
    if (!session || !connected) return;

    send({
      type: "join",
      playerId: session.playerId,
      name: session.name,
      avatarUrl: session.avatarUrl,
      isHost: session.isHost,
      templateId: session.templateId,
    });
  }, [session, connected, send]);

  const startGame = useCallback(() => send({ type: "start" }), [send]);
  const submitAnswers = useCallback(
    (answers: Record<string, string>) => send({ type: "submit", answers }),
    [send]
  );
  const playAgain = useCallback(() => send({ type: "play-again" }), [send]);

  return {
    state,
    error,
    connected,
    startGame,
    submitAnswers,
    playAgain,
  };
}
