import { NextRequest, NextResponse } from "next/server";
import { generateCaricature, hasAiProvider } from "@/lib/comic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { imageUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  if (!hasAiProvider()) {
    // No image provider configured: the original photo is used as-is.
    return NextResponse.json({ caricatureUrl: body.imageUrl, generated: false });
  }

  const caricatureUrl = await generateCaricature(body.imageUrl);
  return NextResponse.json({
    caricatureUrl: caricatureUrl ?? body.imageUrl,
    generated: Boolean(caricatureUrl),
  });
}
