import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LyricCue } from "@/types";

// Cap: a typical song has 60-100 cues. Compilation mixes can have thousands.
// We limit to 300 so Gemini translation stays fast and within token budgets.
const MAX_CUES = 300;
// Translate in batches so we never exceed Gemini's input token limit in one call.
const TRANSLATION_CHUNK_SIZE = 80;

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "missing_video_id" }, { status: 400 });
  }

  try {
    // Attempt to fetch Spanish captions. If the video has no Spanish track,
    // fall back to whatever language is available (auto-generated captions).
    let rawCues;
    try {
      rawCues = await YoutubeTranscript.fetchTranscript(videoId, { lang: "es" });
    } catch {
      // No Spanish track — try default (often auto-generated in the video's language)
      rawCues = await YoutubeTranscript.fetchTranscript(videoId);
    }

    // AC-1.7: Guard against empty or junk caption tracks
    if (!rawCues || rawCues.length < 3) {
      return NextResponse.json({ error: "no_captions" }, { status: 404 });
    }
    const validCues = rawCues.filter((c) => c.text && c.text.trim().length >= 2);
    if (validCues.length < 3) {
      return NextResponse.json({ error: "no_captions" }, { status: 404 });
    }

    // The youtube-transcript package uses milliseconds when it hits the InnerTube
    // API (the primary path) and seconds when it falls back to web scraping.
    // Heuristic: if any offset > 1000, the values are almost certainly milliseconds
    // (no song has a lyric starting after 16+ minutes in "seconds" mode).
    const isMs = validCues.some((c) => c.offset > 1000);
    const toSeconds = (v: number) => (isMs ? v / 1000 : v);

    // Cap to MAX_CUES — compilations can have thousands of lines we don't need
    const trimmedCues = validCues.slice(0, MAX_CUES);

    // Build preliminary cues with Spanish text and computed timestamps
    const spanishCues = trimmedCues.map((c, i) => {
      const start = toSeconds(c.offset);
      const ownEnd = toSeconds(c.offset + c.duration);
      // Use the next cue's start as the end boundary to avoid gaps between lines
      const nextStart = trimmedCues[i + 1]
        ? toSeconds(trimmedCues[i + 1].offset)
        : ownEnd;
      return {
        start,
        end: Math.max(ownEnd, nextStart),
        spanish: c.text.trim().replace(/\n/g, " "),
      };
    });

    // Translate in chunks — safer for token limits and avoids single huge requests.
    // AC-2.3: if translation fails for any reason, fall back to showing Spanish text.
    let translations: string[] = spanishCues.map(() => "");
    try {
      translations = await translateInChunks(spanishCues.map((c) => c.spanish));
    } catch (translationErr) {
      console.warn(
        "[/api/lyrics] Translation failed, showing Spanish-only fallback:",
        translationErr
      );
    }

    const cues: LyricCue[] = spanishCues.map((cue, i) => ({
      ...cue,
      // If translation string is empty, fall back to the Spanish line (AC-2.3)
      english: translations[i] || cue.spanish,
    }));

    return NextResponse.json({ cues });
  } catch (error) {
    console.error("[/api/lyrics] fetch failed:", error);

    // Distinguish "no captions" (expected) from unexpected server errors
    const message =
      error instanceof Error ? error.message.toLowerCase() : "";
    const isNoCaption =
      message.includes("no transcript") ||
      message.includes("disabled") ||
      message.includes("unavailable") ||
      message.includes("not available");

    if (isNoCaption) {
      return NextResponse.json({ error: "no_captions" }, { status: 404 });
    }
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

// Split lines into chunks and translate each chunk sequentially.
// This keeps each Gemini request small and avoids token-limit failures.
async function translateInChunks(lines: string[]): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < lines.length; i += TRANSLATION_CHUNK_SIZE) {
    const chunk = lines.slice(i, i + TRANSLATION_CHUNK_SIZE);
    const translated = await translateWithGemini(chunk);
    results.push(...translated);
  }
  return results;
}

// Translate one chunk of Spanish lyric lines to English using Gemini 2.5 Flash.
async function translateWithGemini(lines: string[]): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    console.warn("[lyrics] GEMINI_API_KEY not configured — skipping translation");
    return lines.map(() => "");
  }

  const genai = new GoogleGenerativeAI(apiKey);
  // gemini-2.5-flash-lite: fast, higher free-tier quota than gemini-2.5-flash, great for bulk translation
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = `You are translating Spanish song lyrics to English.
Translate each numbered line with musical and poetic intent — natural and flowing, not word-for-word literal.
Preserve the emotional tone and rhythm of the original.
Return ONLY a valid JSON array of strings, one English translation per line, in the same order.
Do not include any markdown, code blocks, or explanation.

Spanish lines:
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Strip markdown code fences if Gemini wraps its response anyway
  const cleaned = raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response was not a JSON array");
  }

  // Gemini occasionally returns 1-2 extra items or drops one.
  // Trim any excess; pad with "" so callers fall back to Spanish for missing lines.
  const normalised = lines.map((_, i) => (parsed[i] as string) ?? "");
  return normalised;
}
