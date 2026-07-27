import { NextRequest, NextResponse } from "next/server";
import { availableImageProviders } from "@/lib/comic";
import { resolvePartyHost } from "@/lib/party-host";

// Read at request time so the PartyKit host can change (e.g. a new preview
// tunnel) without needing to rebuild the Next.js app.
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const partyHost = resolvePartyHost(request.headers.get("host"));

  return NextResponse.json(
    { partyHost, imageProviders: availableImageProviders() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
