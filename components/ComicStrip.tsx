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
      <div className="grid gap-4 sm:grid-cols-2" data-testid="comic-panels">
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
            {!panel.imageUrl && panel.imageFailureReason && (
              <div className="border-t border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  Image failed
                </p>
                <p className="mt-1 text-[12px] leading-snug text-amber-900">
                  {panel.imageFailureReason}
                </p>
              </div>
            )}
            {panel.imageAttempts && panel.imageAttempts.length > 0 && (
              <details className="border-t border-zinc-200 bg-zinc-50 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">
                  Image attempt log ({panel.imageAttempts.length})
                  {panel.imageUrl ? " — recovered after retries" : " — all failed"}
                </summary>
                <ul className="mt-2 space-y-2">
                  {panel.imageAttempts.map((a, i) => (
                    <li
                      key={`${a.attempt}-${i}`}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] leading-snug"
                    >
                      <p className="font-medium text-zinc-800">
                        {a.ok ? "✓" : "✗"} {a.attempt}
                      </p>
                      {a.reason && (
                        <p className="mt-0.5 text-amber-800">{a.reason}</p>
                      )}
                      {a.caption && (
                        <p className="mt-0.5 text-zinc-500">
                          Caption tried: {a.caption}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {panel.imagePrompt && (
              <details className="border-t border-zinc-200 bg-zinc-50 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">
                  Text sent to the image AI
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-600">
                  {panel.imagePrompt}
                </pre>
              </details>
            )}
          </figure>
        ))}
      </div>

      {comic.cast && comic.cast.length > 0 && (
        <details className="rounded-xl border border-white/10 bg-white/5 p-4">
          <summary className="cursor-pointer text-sm font-medium text-white/80">
            Character descriptions sent to the image AI ({comic.cast.length})
          </summary>
          <p className="mt-2 text-xs text-white/40">
            These feature descriptions — not the names — are what the AI uses to
            draw each person consistently in every panel.
          </p>
          <ul className="mt-3 space-y-3">
            {comic.cast.map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <PlayerAvatar name={c.name} avatarUrl={c.imageUrl} size="sm" />
                <div className="text-sm">
                  <p className="flex items-center gap-2 font-medium text-white">
                    {c.name}
                    {c.descriptionSource === "photo" && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                        from photo
                      </span>
                    )}
                    {c.descriptionSource === "web" && (
                      <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-200">
                        found online
                      </span>
                    )}
                  </p>
                  <p className="text-white/60">
                    {c.description ? (
                      c.description
                    ) : (
                      <span className="italic text-white/40">
                        No photo or online match — drawn as an original character.
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
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
