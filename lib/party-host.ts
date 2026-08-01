function isLoopback(host: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host.trim());
}

/** Private LAN ranges where PartyKit may run on the same machine as Next. */
function isPrivateLan(hostname: string): boolean {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
}

/**
 * Resolve the PartyKit host clients should connect to.
 *
 * On Vercel / public deploys, PartyKit must be deployed separately and the
 * host provided via PARTYKIT_HOST or NEXT_PUBLIC_PARTYKIT_HOST. We never invent
 * `*.vercel.app:1999` — that host cannot run PartyKit and leaves the lobby
 * stuck on "Connecting...".
 */
export function resolvePartyHost(requestHost: string | null): string {
  const configured = (
    process.env.PARTYKIT_HOST ??
    process.env.NEXT_PUBLIC_PARTYKIT_HOST ??
    ""
  ).trim();

  // Explicit non-loopback override — use as-is (deploy / tunnel).
  if (configured && !isLoopback(configured)) {
    return configured.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }

  const hostname = (requestHost ?? "").split(":")[0].trim();

  // Phone on LAN hits 192.168.x.x:3000 — PartyKit must use the same IP.
  if (hostname && isPrivateLan(hostname)) {
    return `${hostname}:1999`;
  }

  // Local development.
  if (!hostname || isLoopback(hostname)) {
    return configured || "localhost:1999";
  }

  // Public host (e.g. *.vercel.app) with no PartyKit env configured.
  return "";
}
