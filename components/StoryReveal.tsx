"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Copy, Maximize2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { CaricatureStyle, ComicStripData, GameState, Story } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { ComicStrip, ComicStripSkeleton } from "./ComicStrip";

type StoryRevealProps = {
  state: GameState;
  isHost: boolean;
  onPlayAgain: () => void;
  onSubmitTidy?: (stories: { id: string; tidyProse: string }[]) => void;
};

const STYLE_OPTIONS: {
  value: CaricatureStyle;
  label: string;
  hint: string;
}[] = [
  { value: "faithful", label: "Close to photo", hint: "Barely stylised — keeps features close to the original image." },
  { value: "balanced", label: "Balanced", hint: "A recognisable caricature with a moderate cartoon exaggeration." },
  { value: "exaggerated", label: "Exaggerated", hint: "High harshness — really amplifies each person's distinctive features." },
  { value: "flattering", label: "Flattering", hint: "Enhances attractive features so everyone looks their best." },
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["'”’]?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function StoryReveal({ state, isHost, onPlayAgain, onSubmitTidy }: StoryRevealProps) {
  const [index, setIndex] = useState(0);
  const [readAloud, setReadAloud] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [comics, setComics] = useState<Record<string, ComicStripData>>({});
  const [comicLoading, setComicLoading] = useState(false);
  const [comicError, setComicError] = useState<string | null>(null);
  const [tidying, setTidying] = useState(false);
  const [caricatureStyle, setCaricatureStyle] = useState<CaricatureStyle>("balanced");
  const tidyAttemptRef = useRef<string>("");

  const stories = state.stories;
  const story = stories[index];

  // Host polishes the stories once and broadcasts the result to everyone.
  useEffect(() => {
    if (!isHost || !state.tidyEnabled || !onSubmitTidy) return;
    const signature = stories.map((s) => s.id).join(",");
    if (!signature) return;
    if (!stories.some((s) => !s.tidyProse)) return; // all already polished
    if (tidyAttemptRef.current === signature) return; // already attempted this round
    tidyAttemptRef.current = signature;

    setTidying(true);
    (async () => {
      try {
        const res = await fetch("/api/tidy-stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stories: stories.map((s) => ({ id: s.id, prose: s.prose })),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            stories?: { id: string; tidyProse: string }[];
          };
          if (data.stories?.length) onSubmitTidy(data.stories);
        }
      } catch {
        // Leave the original prose in place on failure.
      } finally {
        setTidying(false);
      }
    })();
  }, [isHost, state.tidyEnabled, stories, onSubmitTidy]);

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

  async function generateComic(target: Story) {
    setComicError(null);
    setComicLoading(true);
    try {
      const res = await fetch("/api/generate-comic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: target, style: caricatureStyle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Comic generation failed");
      }
      const data = (await res.json()) as { comic: ComicStripData };
      setComics((prev) => ({ ...prev, [target.id]: data.comic }));
    } catch (err) {
      setComicError(err instanceof Error ? err.message : "Comic generation failed");
    } finally {
      setComicLoading(false);
    }
  }

  const displayProse = story.tidyProse ?? story.prose;
  // Polish requested for this story but not back yet (non-host or in flight).
  const awaitingTidy = state.tidyEnabled && !story.tidyProse;

  async function copyStory() {
    await navigator.clipboard.writeText(displayProse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (readAloud) {
    // When polished, reveal by sentence; otherwise by contributor line.
    const usingTidy = Boolean(story.tidyProse);
    const segments = usingTidy ? splitSentences(story.tidyProse!) : story.lines.map((l) => l.display);
    const line = usingTidy ? null : story.lines[lineIndex];
    const isLastLine = lineIndex >= segments.length - 1;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-900 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-widest text-white/50">
            Story {index + 1} of {stories.length}
          </p>
          <Button variant="ghost" size="icon" onClick={() => setReadAloud(false)} aria-label="Close read-aloud">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="max-w-3xl text-2xl font-medium leading-relaxed text-white md:text-4xl">
            {segments.slice(0, lineIndex + 1).map((seg, i) => (
              <span key={i} className={i === lineIndex ? "text-white" : "text-white/35"}>
                {seg}{" "}
              </span>
            ))}
          </p>
          {line && (
            <div className="mt-8 flex items-center gap-2 text-sm text-white/50">
              <PlayerAvatar name={line.playerName} avatarUrl={line.playerAvatarUrl} size="sm" />
              <span>contributed by {line.playerName}</span>
            </div>
          )}
        </div>
        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            disabled={lineIndex === 0}
            onClick={() => setLineIndex((i) => i - 1)}
          >
            <ChevronLeft className="h-4 w-4" /> Back
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
            {isLastLine ? "Finish" : "Reveal next"} <ChevronRight className="h-4 w-4" />
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
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="secondary" size="icon" onClick={() => setReadAloud(true)} aria-label="Read aloud mode">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl bg-white/5 p-6">
        {awaitingTidy && (
          <p className="mb-3 flex items-center gap-2 text-xs text-violet-300">
            <Wand2 className="h-3.5 w-3.5" />
            {tidying ? "Polishing the wording with AI..." : "Waiting for the host to polish the wording..."}
          </p>
        )}
        {story.tidyProse && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-violet-300">
            <Wand2 className="h-3.5 w-3.5" /> AI-polished
          </p>
        )}
        <p className="text-lg leading-relaxed text-white md:text-xl">{displayProse}</p>
      </div>

      <details className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white/80">
          See who wrote what
        </summary>
        <ul className="mt-3 space-y-3">
          {story.lines.map((line) => (
            <li key={line.promptId} className="flex items-start gap-3">
              <PlayerAvatar name={line.playerName} avatarUrl={line.playerAvatarUrl} size="sm" />
              <div className="text-sm">
                <p className="text-white/40">
                  {line.promptLabel} · {line.playerName}
                </p>
                <p className="text-white">{line.text}</p>
              </div>
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

      <div className="mb-4">
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/60">
            Caricature style
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STYLE_OPTIONS.map((opt) => {
              const selected = caricatureStyle === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCaricatureStyle(opt.value)}
                  disabled={comicLoading}
                  aria-pressed={selected}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-violet-400 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-white/50">
            {STYLE_OPTIONS.find((o) => o.value === caricatureStyle)?.hint}
          </p>
        </div>
        {comics[story.id] ? (
          <ComicStrip comic={comics[story.id]} />
        ) : comicLoading ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-white/60">Drawing your comic strip...</p>
            <ComicStripSkeleton />
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => generateComic(story)}
          >
            <Sparkles className="h-4 w-4" />
            Generate comic strip
          </Button>
        )}
        {comicError && (
          <p className="mt-2 text-center text-sm text-red-300">{comicError}</p>
        )}
        {comics[story.id] && (
          <Button
            variant="ghost"
            size="sm"
            className="mx-auto mt-2 flex"
            onClick={() => generateComic(story)}
            disabled={comicLoading}
          >
            <Sparkles className="h-4 w-4" />
            Regenerate
          </Button>
        )}
      </div>

      {isHost && (
        <Button className="mt-2 w-full" onClick={onPlayAgain}>
          Play again
        </Button>
      )}
    </Card>
  );
}
