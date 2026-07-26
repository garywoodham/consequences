"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Images,
  Maximize2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type {
  CaricatureStyle,
  ComicBuildResult,
  ComicStripData,
  GameState,
  Story,
} from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { ComicStrip, ComicStripSkeleton } from "./ComicStrip";

/** Safety cap so a stuck panel can't loop forever (~2 images per chunk). */
const MAX_COMIC_CHUNKS = 12;

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
  // Fullscreen panel-by-panel reveal (image + caption), mirrors words-only mode.
  const [comicSlideshow, setComicSlideshow] = useState(false);
  const [panelIndex, setPanelIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [comics, setComics] = useState<Record<string, ComicStripData>>({});
  const [comicLoading, setComicLoading] = useState(false);
  const [comicProgress, setComicProgress] = useState<string | null>(null);
  const [comicError, setComicError] = useState<string | null>(null);
  const [tidying, setTidying] = useState(false);
  const [caricatureStyle, setCaricatureStyle] = useState<CaricatureStyle>("balanced");
  const tidyAttemptRef = useRef<string>("");

  const stories = state.stories;
  const story = stories[index];
  const currentComic = story ? comics[story.id] : undefined;

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
    setPanelIndex(0);
  }

  function prevStory() {
    setIndex((i) => Math.max(i - 1, 0));
    setLineIndex(0);
    setPanelIndex(0);
  }

  function openComicSlideshow() {
    setPanelIndex(0);
    setComicSlideshow(true);
  }

  async function generateComic(target: Story) {
    setComicError(null);
    setComicLoading(true);
    setComicProgress("Starting comic…");
    // Fresh generate clears any prior strip for this story; resume chunks
    // keep carrying the in-progress comic forward.
    let previousComic: ComicStripData | undefined;
    let chunk = 0;
    let networkRetries = 0;

    try {
      while (chunk < MAX_COMIC_CHUNKS) {
        chunk += 1;
        setComicProgress(
          previousComic
            ? `Continuing comic (pass ${chunk}) — keeping finished panels & looks…`
            : `Drawing comic (pass ${chunk})…`
        );

        let res: Response;
        try {
          res = await fetch("/api/generate-comic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              story: target,
              style: caricatureStyle,
              previousComic,
            }),
          });
        } catch {
          // Tunnel/proxy often aborts long requests. Retry the same chunk a
          // couple of times (with whatever progress we already have).
          networkRetries += 1;
          if (networkRetries <= 3) {
            chunk -= 1;
            setComicProgress(
              `Connection dropped — retrying pass ${chunk + 1}…`
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          throw new Error(
            "Connection dropped while drawing the comic. Tap Regenerate to continue."
          );
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Comic generation failed");
        }

        const data = (await res.json()) as ComicBuildResult;
        previousComic = data.comic;
        networkRetries = 0;
        setComics((prev) => ({ ...prev, [target.id]: data.comic }));

        const doneCount = data.comic.panels.filter((p) => p.imageUrl).length;
        const total = data.comic.panels.length;
        setComicProgress(
          data.complete
            ? null
            : `Drawn ${doneCount}/${total} panels — starting another pass for the rest…`
        );

        if (data.complete) break;

        // Nothing new this chunk and still incomplete → stop rather than spin.
        if (data.generatedThisChunk === 0 && chunk > 1) {
          setComicError(
            `Stopped after ${doneCount}/${total} panels — remaining panels could not be drawn.`
          );
          break;
        }
      }

      if (chunk >= MAX_COMIC_CHUNKS && previousComic) {
        const doneCount = previousComic.panels.filter((p) => p.imageUrl).length;
        const total = previousComic.panels.length;
        if (doneCount < total) {
          setComicError(
            `Reached the pass limit with ${doneCount}/${total} panels drawn. Tap Regenerate to retry the rest.`
          );
        }
      }
    } catch (err) {
      setComicError(err instanceof Error ? err.message : "Comic generation failed");
    } finally {
      setComicLoading(false);
      setComicProgress(null);
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

  if (comicSlideshow && currentComic) {
    const panels = currentComic.panels;
    const safeIndex = Math.min(panelIndex, Math.max(0, panels.length - 1));
    const panel = panels[safeIndex];
    const isLastPanel = safeIndex >= panels.length - 1;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-900 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-widest text-white/50">
            Panel {safeIndex + 1} of {panels.length}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setComicSlideshow(false);
              setPanelIndex(0);
            }}
            aria-label="Close comic slideshow"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-4">
          <div className="relative flex max-h-[min(65vh,720px)] w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl border-2 border-white/80 bg-black/30 shadow-2xl">
            {panel?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={panel.imageUrl}
                alt={panel.caption}
                className="max-h-[min(65vh,720px)] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-square w-full max-w-md flex-col items-center justify-center gap-3 p-6 text-white/60">
                {panel?.characters?.length ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {panel.characters.map((c) => (
                      <div key={c.id} className="flex flex-col items-center gap-1">
                        <PlayerAvatar name={c.name} avatarUrl={c.imageUrl} size="lg" />
                        <span className="text-xs text-white/70">{c.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-5xl">✨</span>
                )}
                <p className="text-sm">No image for this panel</p>
              </div>
            )}
          </div>
          <p className="max-w-3xl px-2 text-center text-lg font-medium leading-snug text-white md:text-2xl">
            {panel?.caption ?? ""}
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            disabled={safeIndex === 0}
            onClick={() => setPanelIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (isLastPanel) {
                setComicSlideshow(false);
                setPanelIndex(0);
              } else {
                setPanelIndex((i) => i + 1);
              }
            }}
          >
            {isLastPanel ? "Finish" : "Reveal next"} <ChevronRight className="h-4 w-4" />
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
          <Button
            variant="secondary"
            size="icon"
            onClick={openComicSlideshow}
            disabled={!currentComic || currentComic.panels.length === 0}
            aria-label="Comic slideshow mode"
            title={
              currentComic
                ? "Present comic panels fullscreen"
                : "Generate a comic strip first"
            }
          >
            <Images className="h-4 w-4" />
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
        {currentComic ? (
          <ComicStrip comic={currentComic} />
        ) : comicLoading ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-white/60">
              {comicProgress ?? "Drawing your comic strip…"}
            </p>
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
        {comicLoading && currentComic && comicProgress && (
          <p className="mt-2 text-center text-sm text-violet-300">{comicProgress}</p>
        )}
        {comicError && (
          <p className="mt-2 text-center text-sm text-red-300">{comicError}</p>
        )}
        {currentComic && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={openComicSlideshow}
              disabled={currentComic.panels.length === 0 || comicLoading}
            >
              <Images className="h-4 w-4" />
              Present panels
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generateComic(story)}
              disabled={comicLoading}
            >
              <Sparkles className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
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
