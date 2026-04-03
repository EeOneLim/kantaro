import { NextRequest, NextResponse } from "next/server";
import { translateInChunks } from "@/lib/gemini-translate";

// Translation-only endpoint used when the client-side YouTube transcript fetch
// succeeds. The client sends raw Spanish lines; we translate and return them.
// The Gemini API key stays server-side — it is never exposed to the browser.
//
// POST /api/translate
// Body:  { lines: string[] }
// 200:   { translations: string[] }  — same length as input
// 400:   { error: "missing_lines" }
export async function POST(request: NextRequest) {
  let lines: string[];

  try {
    const body = await request.json();
    lines = body?.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "missing_lines" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // AC-CT-2.3: if translation fails for any reason, return empty array so the
  // client can show Spanish-only text rather than an error state.
  try {
    const translations = await translateInChunks(lines);
    return NextResponse.json({ translations });
  } catch (err) {
    console.warn("[/api/translate] Translation failed:", err);
    return NextResponse.json({ translations: [] });
  }
}
