"use client";

import { useState } from "react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveSession } from "@/lib/session";
import { getOrCreatePlayerId } from "@/lib/utils";

export function JoinGameForm() {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const code = roomCode.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!code || code.length !== 6) {
      setError("Please enter a 6-character room code");
      return;
    }
    if (!trimmedName) {
      setError("Please enter your name to continue");
      return;
    }

    setJoining(true);

    try {
      const playerId = getOrCreatePlayerId();
      if (!playerId) {
        throw new Error("Could not create player ID. Try refreshing the page.");
      }

      saveSession({
        playerId,
        name: trimmedName,
        avatarUrl,
        isHost: false,
        roomCode: code,
      });

      window.location.href = `/game/${code}`;
    } catch (err) {
      setJoining(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <CardTitle>Join a game</CardTitle>
      <CardDescription className="mt-1 mb-4">Enter the room code from your host</CardDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AvatarUpload name={name} value={avatarUrl} onChange={setAvatarUrl} />
        <div>
          <label htmlFor="join-code" className="mb-1 block text-sm text-white/80">
            Room code <span className="text-red-300">*</span>
          </label>
          <Input
            id="join-code"
            value={roomCode}
            onChange={(e) => {
              setRoomCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="ABC123"
            maxLength={6}
            className="uppercase tracking-widest"
            required
          />
        </div>
        <div>
          <label htmlFor="join-name" className="mb-1 block text-sm text-white/80">
            Your name <span className="text-red-300">*</span>
          </label>
          <Input
            id="join-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Enter your name"
            maxLength={30}
            required
            autoComplete="name"
          />
        </div>
        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={joining}>
          {joining ? "Joining..." : "Join game"}
        </Button>
      </form>
    </Card>
  );
}
