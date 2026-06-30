"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrCreatePlayerId } from "@/lib/utils";

export function JoinGameForm() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code || code.length !== 6) {
      setError("Please enter a 6-character room code");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    const playerId = getOrCreatePlayerId();
    sessionStorage.setItem(
      "consequences-session",
      JSON.stringify({
        playerId,
        name: name.trim(),
        avatarUrl,
        isHost: false,
        roomCode: code,
      })
    );

    router.push(`/game/${code}`);
  }

  return (
    <Card>
      <CardTitle>Join a game</CardTitle>
      <CardDescription className="mt-1 mb-4">Enter the room code from your host</CardDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AvatarUpload name={name} value={avatarUrl} onChange={setAvatarUrl} />
        <div>
          <label className="mb-1 block text-sm text-white/80">Room code</label>
          <Input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="uppercase tracking-widest"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/80">Your name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={30}
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" className="w-full">
          Join game
        </Button>
      </form>
    </Card>
  );
}
