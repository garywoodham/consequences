import { NextResponse } from "next/server";

// Read at request time so the PartyKit host can change (e.g. a new preview
// tunnel) without needing to rebuild the Next.js app.
export const dynamic = "force-dynamic";

export function GET() {
  const partyHost =
    process.env.PARTYKIT_HOST ?? process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "";

  return NextResponse.json(
    { partyHost },
    { headers: { "Cache-Control": "no-store" } }
  );
}
