"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Maximize2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { GameState } from "@/lib/types";

type StoryRevealProps = {
  state: GameState;
  isHost: boolean;
  onPlayAgain: () => void;
};

export function StoryReveal({ state, isHost, onPlayAgain }: StoryRevealProps) {
  const [index, setIndex] = useState(0);
  const [readAloud, setReadAloud] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const stories = state.stories;
  const story = stories[index];

  if (!story) {
    return (
      <Card>
        <CardTitle>No stories yet</CardTitle>
        <CardDescription>Something went wrong generating stories.</CardDescription>
      </Card>
    );
  }

  function nextStory() {
    setIndex((i) => Math.min(i + 1, stories.length - 1));
    setLineIndex(0);
  }

  function prevStory() {
    setIndex((i) => Math.max(i - 1, 0));
    setLineIndex(0);
  }

  async function copyStory() {
    await navigator.clipboard.writeText(story.prose);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (readAloud) {
    const line = story.lines[lineIndex];
    const isLastLine = lineIndex >= story.lines.length - 1;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-900 p-6">
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" onClick={() => setReadAloud(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="mb-4 text-sm uppercase tracking-widest text-white/50">
            Story {index + 1} of {stories.length} — Line {lineIndex + 1}
          </p>
          <p className="max-w-2xl text-3xl font-medium leading-relaxed text-white md:text-4xl">
            {line ? (
              <>
                <span className="text-white/60">{line.text}</span>
              </>
            ) : (
              story.prose
            )}
          </p>
          {line && (
            <p className="mt-4 text-sm text-white/40">— {line.playerName}</p>
          )}
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            disabled={lineIndex === 0}
            onClick={() => setLineIndex((i) => i - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Previous line
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (isLastLine) {
                setReadAloud(false);
                setLineIndex(0);
              } else {
                setLineIndex((i) => i + 1);
              }
            }}
          >
            {isLastLine ? "Done" : "Next line"} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <CardTitle>Story {index + 1} of {stories.length}</CardTitle>
          <CardDescription className="mt-1">Read it aloud for maximum chaos</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" onClick={copyStory} aria-label="Copy story">
            {copied ? "✓" : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="secondary" size="icon" onClick={() => setReadAloud(true)} aria-label="Read aloud mode">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white/5 p-6">
        <p className="text-lg leading-relaxed text-white md:text-xl">{story.prose}</p>
      </div>

      <details className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white/80">
          See who wrote what
        </summary>
        <ul className="mt-3 space-y-2">
          {story.lines.map((line) => (
            <li key={line.promptId} className="text-sm text-white/70">
              <span className="text-white/40">{line.playerName}:</span> {line.text}
            </li>
          ))}
        </ul>
      </details>

      <div className="mb-4 flex items-center justify-between">
        <Button variant="secondary" onClick={prevStory} disabled={index === 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="text-sm text-white/60">
          {index + 1} / {stories.length}
        </span>
        <Button variant="secondary" onClick={nextStory} disabled={index === stories.length - 1}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="secondary"
        className="mb-3 w-full"
        disabled
        title="Coming in Phase 2"
      >
        <Sparkles className="h-4 w-4" />
        Generate comic strip (Phase 2)
      </Button>

      {isHost && (
        <Button className="w-full" onClick={onPlayAgain}>
          Play again
        </Button>
      )}
    </Card>
  );
}
