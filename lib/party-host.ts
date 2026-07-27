/** Resolve the PartyKit host clients should connect to. */
export function resolvePartyHost(requestHost: string | null): string {
  const configured =
    process.env.PARTYKIT_HOST ??
    process.env.NEXT_PUBLIC_PARTYKIT_HOST ??
    "";

  const isLoopback = (host: string) =>
    /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host.trim());

  // Explicit non-loopback override — use as-is (deploy / tunnel).
  if (configured && !isLoopback(configured)) {
    return configured;
  }

  // Phone on LAN hits 192.168.x.x:3000 — PartyKit must use the same IP, not 127.0.0.1.
  if (requestHost && !isLoopback(requestHost.split(":")[0])) {
    const hostname = requestHost.split(":")[0];
    return `${hostname}:1999`;
  }

  return configured || "localhost:1999";
}
