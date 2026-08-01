import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Consequences
        </h1>
        <p className="mt-2 text-white/70">Enter the party code to get in</p>
      </header>

      <Suspense
        fallback={
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
