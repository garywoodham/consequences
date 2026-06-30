import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Comic strip generation is coming in Phase 2",
      phase: 2,
    },
    { status: 501 }
  );
}
