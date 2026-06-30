"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTemplateById } from "@/lib/prompts";
import type { GameState } from "@/lib/types";
import { PlayerNamePicker } from "./PlayerNamePicker";

type PromptFormProps = {
  state: GameState;
  currentPlayerId: string;
  onSubmit: (answers: Record<string, string>) => void;
};

export function PromptForm({ state, currentPlayerId, onSubmit }: PromptFormProps) {
  const template = getTemplateById(state.templateId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submittedCount = state.players.filter((p) => p.hasSubmitted).length;
  const totalCount = state.players.filter((p) => p.connected).length;
  const currentPlayer = state.players.find((p) => p.id === currentPlayerId);
  const alreadySubmitted = currentPlayer?.hasSubmitted ?? false;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = template.prompts.filter((p) => !answers[p.id]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in all prompts (${missing.length} remaining)`);
      return;
    }
    onSubmit(answers);
  }

  if (alreadySubmitted) {
    return (
      <Card>
        <CardTitle>Answers submitted!</CardTitle>
        <CardDescription className="mt-2">
          Waiting for other players... ({submittedCount}/{totalCount} submitted)
        </CardDescription>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${(submittedCount / totalCount) * 100}%` }}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Fill in your answers</CardTitle>
      <CardDescription className="mt-1 mb-2">
        Don&apos;t peek — your answers will be mixed with everyone else&apos;s!
      </CardDescription>
      <p className="mb-4 text-xs text-white/50">
        {submittedCount}/{totalCount} players submitted
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {template.prompts.map((prompt, index) => (
          <div key={prompt.id}>
            <label className="mb-2 block text-sm font-medium text-white">
              {index + 1}. {prompt.label}
            </label>
            {prompt.type === "name" ? (
              <PlayerNamePicker
                players={state.players}
                currentPlayerId={currentPlayerId}
                value={answers[prompt.id] ?? ""}
                onChange={(val) => setAnswers((prev) => ({ ...prev, [prompt.id]: val }))}
                placeholder={prompt.placeholder}
              />
            ) : (
              <Input
                value={answers[prompt.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [prompt.id]: e.target.value }))
                }
                placeholder={prompt.placeholder}
                maxLength={200}
              />
            )}
          </div>
        ))}

        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" className="w-full">
          Submit answers
        </Button>
      </form>
    </Card>
  );
}
