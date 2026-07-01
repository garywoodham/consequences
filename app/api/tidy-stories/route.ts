import { NextRequest, NextResponse } from "next/server";
import { tidyStories } from "@/lib/tidy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { stories?: { id: string; prose: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const stories = body.stories;
  if (!Array.isArray(stories) || stories.length === 0) {
    return NextResponse.json({ error: "stories are required" }, { status: 400 });
  }

  const clean = stories
    .filter((s) => s && typeof s.id === "string" && typeof s.prose === "string")
    .map((s) => ({ id: s.id, prose: s.prose }));

  try {
    const tidied = await tidyStories(clean);
    return NextResponse.json({ stories: tidied });
  } catch (error) {
    console.error("Story tidy failed:", error);
    return NextResponse.json({ error: "Story tidy failed" }, { status: 500 });
  }
}
