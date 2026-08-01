import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  getExpectedAccessCode,
  isValidAccessCode,
} from "@/lib/access";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const unlocked = request.cookies.get(ACCESS_COOKIE)?.value === "1";
  return NextResponse.json({ unlocked });
}

export async function POST(request: NextRequest) {
  let code = "";
  try {
    const body = (await request.json()) as { code?: string };
    code = String(body.code ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isValidAccessCode(code)) {
    return NextResponse.json({ error: "Wrong code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  // Only mark Secure on HTTPS so local `npm start` over http still works.
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });

  // Touch expected code so it isn't tree-shaken away in edge cases.
  void getExpectedAccessCode();

  return response;
}
