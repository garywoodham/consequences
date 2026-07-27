"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { PlayerAvatar } from "./PlayerAvatar";

export type KnownPerson = {
  name: string;
  avatarUrl?: string;
  /** Where this person came from — a game player, or a name typed into a prompt. */
  source: "player" | "added";
};

type PersonInsertMenuProps = {
  people: KnownPerson[];
  onPick: (name: string) => void;
  label?: string;
};

/**
 * A compact dropdown of everyone known in the game (players + any names typed
 * into the name prompts). Picking someone inserts their exact name into the
 * associated field, so references stay linked to the same character in the
 * generated comic.
 */
export function PersonInsertMenu({ people, onPick, label = "Insert a person" }: PersonInsertMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        className="flex h-10 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
      >
        <UserPlus className="h-4 w-4" />
        <span className="hidden sm:inline">Person</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-white/15 bg-zinc-900/95 p-1 shadow-xl backdrop-blur"
        >
          {people.length === 0 ? (
            <p className="px-3 py-2 text-xs text-white/50">
              No one yet — add names in the name prompts first.
            </p>
          ) : (
            people.map((person) => (
              <button
                key={`${person.source}-${person.name}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(person.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10"
              >
                <PlayerAvatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
                <span className="flex-1 truncate text-sm text-white">{person.name}</span>
                {person.source === "added" && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
                    typed
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
