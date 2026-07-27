"use client";

import { useRef, useState } from "react";
import { Dices, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTemplateById } from "@/lib/prompts";
import {
  pickRandomPresetAnswer,
  pickRandomPresetAnswers,
} from "@/lib/preset-stories";
import type { GameState } from "@/lib/types";
import { PlayerNamePicker } from "./PlayerNamePicker";
import { PersonInsertMenu, type KnownPerson } from "./PersonInsertMenu";

type PromptFormProps = {
  state: GameState;
  currentPlayerId: string;
  onSubmit: (answers: Record<string, string>) => void;
  /** When true (host default), random famous-name fills are featured. */
  usePresets?: boolean;
};

export function PromptForm({
  state,
  currentPlayerId,
  onSubmit,
  usePresets = true,
}: PromptFormProps) {
  const template = getTemplateById(state.templateId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastPresetTitle, setLastPresetTitle] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Everyone the writer can link to: all players in the game, plus any names
  // they've typed into the name prompts (person 1 / person 2). Picking one
  // from a field's dropdown inserts that exact name, so the reference stays
  // tied to the same character when the comic is generated.
  const knownPeople: KnownPerson[] = (() => {
    const seen = new Set<string>();
    const people: KnownPerson[] = [];
    for (const p of state.players) {
      const key = p.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      people.push({ name: p.name.trim(), avatarUrl: p.avatarUrl, source: "player" });
    }
    for (const prompt of template.prompts) {
      if (prompt.type !== "name") continue;
      const typed = answers[prompt.id]?.trim();
      if (!typed) continue;
      const key = typed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({ name: typed, source: "added" });
    }
    return people;
  })();

  /** Insert a name into a free-text field at the caret (or append). */
  function insertPerson(promptId: string, name: string) {
    const el = inputRefs.current[promptId];
    const current = answers[promptId] ?? "";
    let next: string;
    let caret: number;
    if (el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const spaceBefore = before && !/\s$/.test(before) ? " " : "";
      const spaceAfter = after && !/^\s/.test(after) ? " " : "";
      const chunk = `${spaceBefore}${name}${spaceAfter}`;
      next = (before + chunk + after).slice(0, 200);
      caret = Math.min((before + chunk).length, next.length);
    } else {
      next = (current ? `${current} ${name}` : name).slice(0, 200);
      caret = next.length;
    }
    setAnswers((prev) => ({ ...prev, [promptId]: next }));
    requestAnimationFrame(() => {
      const node = inputRefs.current[promptId];
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  }

  /** Fill one prompt from the famous-names preset library. */
  function fillRandomAnswer(promptId: string) {
    const picked = pickRandomPresetAnswer(state.templateId, promptId);
    if (!picked) return;
    setAnswers((prev) => ({ ...prev, [promptId]: picked }));
    setLastPresetTitle(null);
    setError(null);
  }

  /** Fill every prompt from one random complete preset story. */
  function fillRandomStory() {
    const filled = pickRandomPresetAnswers(state.templateId);
    setAnswers(filled);
    setLastPresetTitle("Random preset loaded — edit anything you like");
    setError(null);
  }

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
            style={{ width: `${totalCount > 0 ? (submittedCount / totalCount) * 100 : 0}%` }}
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
      <p className="mb-3 text-xs text-white/50">
        {submittedCount}/{totalCount} players submitted
      </p>

      {usePresets && (
        <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/60">
              Stuck? Pull a random answer (funny → filthy) — celebrities,
              historical figures and infamous criminals.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={fillRandomStory}
              className="shrink-0"
            >
              <Shuffle className="h-4 w-4" />
              Random full story
            </Button>
          </div>
          {lastPresetTitle && (
            <p className="mt-2 text-xs text-violet-300">{lastPresetTitle}</p>
          )}
        </div>
      )}

      {!usePresets && (
        <div className="mb-4 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={fillRandomStory}>
            <Shuffle className="h-4 w-4" />
            Random famous-name story
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {template.prompts.map((prompt, index) => (
          <div key={prompt.id}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-white">
                {index + 1}. {prompt.label}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs text-white/60 hover:text-white"
                onClick={() => fillRandomAnswer(prompt.id)}
                aria-label={`Pick a random answer for ${prompt.label}`}
                title="Pick a random preset answer"
              >
                <Dices className="h-3.5 w-3.5" />
                Random
              </Button>
            </div>
            {prompt.type === "name" ? (
              <PlayerNamePicker
                players={state.players}
                currentPlayerId={currentPlayerId}
                value={answers[prompt.id] ?? ""}
                onChange={(val) => setAnswers((prev) => ({ ...prev, [prompt.id]: val }))}
                placeholder={prompt.placeholder}
              />
            ) : (
              <div className="flex items-start gap-2">
                <Input
                  ref={(el) => {
                    inputRefs.current[prompt.id] = el;
                  }}
                  value={answers[prompt.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [prompt.id]: e.target.value }))
                  }
                  placeholder={prompt.placeholder}
                  maxLength={200}
                />
                <PersonInsertMenu
                  people={knownPeople}
                  onPick={(name) => insertPerson(prompt.id, name)}
                />
              </div>
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
