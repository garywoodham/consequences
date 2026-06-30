import { NextRequest, NextResponse } from "next/server";
import { buildComic } from "@/lib/comic";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";
// Image generation can take a while; allow a generous budget where supported.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { story?: Story };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const story = body.story;
  if (!story || !Array.isArray(story.lines) || story.lines.length === 0) {
    return NextResponse.json({ error: "A story with lines is required" }, { status: 400 });
  }

  try {
    const comic = await buildComic(story);
    return NextResponse.json({ comic });
  } catch (error) {
    console.error("Comic generation failed:", error);
    return NextResponse.json({ error: "Comic generation failed" }, { status: 500 });
  }
}
