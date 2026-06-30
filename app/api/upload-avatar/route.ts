import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const MAX_BYTES = 200 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;
      return NextResponse.json({ url: dataUrl });
    }

    const blob = await put(`avatars/${Date.now()}-${file.name}`, file, {
      access: "public",
      token,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Avatar upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
