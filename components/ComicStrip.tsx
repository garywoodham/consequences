"use client";

import type { ComicStripData } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

const PANEL_TINTS = [
  "from-amber-400/30 to-orange-500/20",
  "from-sky-400/30 to-indigo-500/20",
  "from-rose-400/30 to-pink-500/20",
  "from-emerald-400/30 to-teal-500/20",
  "from-violet-400/30 to-fuchsia-500/20",
  "from-yellow-400/30 to-lime-500/20",
];

type ComicStripProps = {
  comic: ComicStripData;
};

export function ComicStrip({ comic }: ComicStripProps) {
  return (
    <div className="space-y-4">
      {comic.mode === "photo" && (
        <p className="text-center text-xs text-white/50">
          Photo comic — add an image API key to generate AI caricature art.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {comic.panels.map((panel) => (
          <figure
            key={panel.index}
            className="overflow-hidden rounded-2xl border-2 border-white/80 bg-white/5 shadow-lg"
          >
            <div
              className={`relative flex aspect-square items-center justify-center bg-gradient-to-br ${
                PANEL_TINTS[panel.index % PANEL_TINTS.length]
              }`}
              style={{
                backgroundImage:
                  panel.imageUrl
                    ? undefined
                    : "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
                backgroundSize: panel.imageUrl ? undefined : "14px 14px",
              }}
            >
              <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-violet-700 text-xs font-bold text-white">
                {panel.index + 1}
              </span>

              {panel.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={panel.imageUrl}
                  alt={panel.caption}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-3 p-4">
                  {panel.characters.length > 0 ? (
                    panel.characters.map((c) => (
                      <div key={c.id} className="flex flex-col items-center gap-1">
                        <PlayerAvatar name={c.name} avatarUrl={c.imageUrl} size="lg" />
                        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white">
                          {c.name}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-4xl">✨</span>
                  )}
                </div>
              )}
            </div>
            <figcaption className="border-t-2 border-white/80 bg-white px-3 py-2 text-sm font-medium leading-snug text-zinc-900">
              {panel.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function ComicStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="aspect-[1/1.15] animate-pulse rounded-2xl border-2 border-white/30 bg-white/10"
        />
      ))}
    </div>
  );
}
