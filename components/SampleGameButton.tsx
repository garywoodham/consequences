"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveSession } from "@/lib/session";
import { createPlayerId, generateRoomCode } from "@/lib/utils";

export function SampleGameButton() {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    try {
      const roomCode = generateRoomCode();
      const playerId = createPlayerId();

      saveSession({
        playerId,
        name: "You",
        isHost: true,
        templateId: "classic",
        roomCode,
        sample: true,
        usePresets: true,
      });

      window.location.href = `/game/${roomCode}`;
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      className="mx-auto"
      onClick={handleClick}
      disabled={loading}
    >
      <Sparkles className="h-4 w-4" />
      {loading ? "Setting up sample..." : "Create sample game (instant test)"}
    </Button>
  );
}
