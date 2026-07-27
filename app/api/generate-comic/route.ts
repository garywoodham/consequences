import { NextRequest, NextResponse } from "next/server";
import { buildComic } from "@/lib/comic";
import {
  CARICATURE_STYLES,
  IMAGE_PROVIDERS,
  type CaricatureStyle,
  type ComicStripData,
  type ImageProvider,
  type Story,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// Image generation can take a while; allow a generous budget where supported.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: {
    story?: Story;
    style?: CaricatureStyle;
    /** Which image engine draws the panels ("openai" default, "flux", or "local"). */
    provider?: ImageProvider;
    /** Partial comic from a previous chunk — resume keeps cast + finished panels. */
    previousComic?: ComicStripData;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const story = body.story;
  if (!story || !Array.isArray(story.lines) || story.lines.length === 0) {
    return NextResponse.json(
      { error: "A story with lines is required" },
      { status: 400 }
    );
  }

  const style: CaricatureStyle = CARICATURE_STYLES.includes(
    body.style as CaricatureStyle
  )
    ? (body.style as CaricatureStyle)
    : "balanced";

  const provider: ImageProvider = IMAGE_PROVIDERS.includes(
    body.provider as ImageProvider
  )
    ? (body.provider as ImageProvider)
    : "openai";

  try {
    const result = await buildComic(
      story,
      style,
      body.previousComic ?? null,
      provider
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Comic generation failed:", error);
    return NextResponse.json(
      { error: "Comic generation failed" },
      { status: 500 }
    );
  }
}
