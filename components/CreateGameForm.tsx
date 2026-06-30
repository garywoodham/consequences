"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PROMPT_TEMPLATES } from "@/lib/prompts";
import { generateRoomCode, getOrCreatePlayerId } from "@/lib/utils";

export function CreateGameForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("classic");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    const roomCode = generateRoomCode();
    const playerId = getOrCreatePlayerId();

    sessionStorage.setItem(
      "consequences-session",
      JSON.stringify({
        playerId,
        name: name.trim(),
        avatarUrl,
        isHost: true,
        templateId,
        roomCode,
      })
    );

    router.push(`/game/${roomCode}`);
  }

  return (
    <Card>
      <CardTitle>Create a game</CardTitle>
      <CardDescription className="mt-1 mb-4">Host a room and invite your friends</CardDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AvatarUpload name={name} value={avatarUrl} onChange={setAvatarUrl} />
        <div>
          <label className="mb-1 block text-sm text-white/80">Your name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={30}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/80">Story template</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex h-11 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {PROMPT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id} className="bg-violet-900">
                {t.name} — {t.description}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" className="w-full">
          Create game
        </Button>
      </form>
    </Card>
  );
}
