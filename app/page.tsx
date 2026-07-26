import { CreateGameForm } from "@/components/CreateGameForm";
import { JoinGameForm } from "@/components/JoinGameForm";
import { SampleGameButton } from "@/components/SampleGameButton";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
          Consequences
        </h1>
        <p className="mt-3 text-lg text-white/70">
          The classic fold-over story game — now online with friends
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <CreateGameForm />
        <JoinGameForm />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <SampleGameButton />
        <p className="text-center text-xs text-white/40">
          Skips setup — 3 players and random famous-name preset stories (funny → filthy) ready to read.
        </p>
      </div>

      <footer className="mt-12 text-center text-sm text-white/40">
        Write secretly · Mix wildly · Read aloud · Laugh loudly
      </footer>
    </main>
  );
}
