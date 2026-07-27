"use client";

import { useState } from "react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PROMPT_TEMPLATES } from "@/lib/prompts";
import { saveSession } from "@/lib/session";
import { generateRoomCode, createPlayerId } from "@/lib/utils";

export function CreateGameForm() {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("classic");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [tidyEnabled, setTidyEnabled] = useState(true);
  const [usePresets, setUsePresets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your name to continue");
      return;
    }

    setCreating(true);

    try {
      const roomCode = generateRoomCode();
      const playerId = createPlayerId();

      if (!playerId) {
        throw new Error("Could not create player ID. Try refreshing the page.");
      }

      saveSession({
        playerId,
        name: trimmedName,
        avatarUrl,
        isHost: true,
        templateId,
        roomCode,
        tidyEnabled,
        usePresets,
      });

      window.location.href = `/game/${roomCode}`;
    } catch (err) {
      setCreating(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <CardTitle>Create a game</CardTitle>
      <CardDescription className="mt-1 mb-4">Host a room and invite your friends</CardDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <AvatarUpload name={name} value={avatarUrl} onChange={setAvatarUrl} />
        <div>
          <label htmlFor="create-name" className="mb-1 block text-sm text-white/80">
            Your name <span className="text-red-300">*</span>
          </label>
          <Input
            id="create-name"
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
        <div>
          <label htmlFor="create-template" className="mb-1 block text-sm text-white/80">
            Story template
          </label>
          <select
            id="create-template"
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
        <label
          htmlFor="create-presets"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-3"
        >
          <input
            id="create-presets"
            type="checkbox"
            checked={usePresets}
            onChange={(e) => setUsePresets(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-500"
          />
          <span className="text-sm">
            <span className="font-medium text-white">
              Use famous-name preset stories by default
            </span>
            <span className="mt-0.5 block text-xs text-white/50">
              Shows random-fill buttons during the game (funny → filthy presets
              with celebrities, historical figures and notorious criminals). On
              by default.
            </span>
          </span>
        </label>
        <label
          htmlFor="create-tidy"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-3"
        >
          <input
            id="create-tidy"
            type="checkbox"
            checked={tidyEnabled}
            onChange={(e) => setTidyEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-500"
          />
          <span className="text-sm">
            <span className="font-medium text-white">Polish wording with AI</span>
            <span className="mt-0.5 block text-xs text-white/50">
              Tidies everyone&apos;s answers into smooth, readable sentences on the reveal.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-400/30 bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={creating}>
          {creating ? "Creating..." : "Create game"}
        </Button>
      </form>
    </Card>
  );
}
