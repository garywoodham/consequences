"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        setError("Wrong code — try again.");
        setLoading(false);
        return;
      }
      const next = searchParams.get("next");
      const dest =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Could not check the code. Try again.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardTitle>Party code</CardTitle>
      <CardDescription className="mt-1 mb-5">
        Ask the host if you don&apos;t have it.
      </CardDescription>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center text-2xl tracking-[0.4em]"
          aria-label="Party access code"
        />
        {error && (
          <p className="text-center text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
          {loading ? "Checking…" : "Enter"}
        </Button>
      </form>
    </Card>
  );
}
