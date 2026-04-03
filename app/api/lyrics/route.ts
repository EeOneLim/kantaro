import { NextRequest, NextResponse } from "next/server";
import { translateInChunks, callGeminiWithFallback } from "@/lib/gemini-translate";
import { LyricCue } from "@/types";

// Cap: a typical song has 60-100 cues. Compilation mixes can have thousands.
// We limit to 300 so Gemini translation stays fast and within token budgets.
const MAX_CUES = 300;

// Server-side in-memory cache. Persists across requests on the same
// server instance so repeat plays (new tabs, page refreshes) cost nothing.
const serverLyricsCache = new Map<string, LyricCue[]>();

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "missing_video_id" }, { status: 400 });
  }

  try {
    // Serve from server cache if already fetched (survives page refreshes
    // and new tabs, unlike the client-side session cache).
    if (serverLyricsCache.has(videoId)) {
      return NextResponse.json({ cues: serverLyricsCache.get(videoId) });
    }

    // Source priority: Supadata (paid API, accurate YouTube captions, not IP-blocked)
    // → LRCLib (free community database) → Genius + Gemini timestamps (last resort).
    let spanishCues = await fetchFromSupadata(videoId);

    if (!spanishCues) {
      console.log(`[/api/lyrics] Supadata failed for ${videoId}, trying LRCLib`);
      spanishCues = await fetchFromLRCLib(videoId);
    }

    if (!spanishCues) {
      console.log(`[/api/lyrics] LRCLib failed for ${videoId}, trying Genius`);
      spanishCues = await fetchFromGenius(videoId);
    }

    if (!spanishCues || spanishCues.length < 3) {
      return NextResponse.json({ error: "no_captions" }, { status: 404 });
    }

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

    // Populate server cache before responding
    serverLyricsCache.set(videoId, cues);

    return NextResponse.json({ cues });
  } catch (error) {
    console.error("[/api/lyrics] fetch failed:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}

// --- Source 1: Supadata (supadata.ai) ---

// Supadata is a paid API that fetches YouTube transcripts from their own
// infrastructure, bypassing the Vercel IP block that prevents us from calling
// YouTube directly. Falls back gracefully if the key isn't configured.
async function fetchFromSupadata(
  videoId: string
): Promise<Array<{ start: number; end: number; spanish: string }> | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=es`,
      { headers: { "x-api-key": apiKey } }
    );

    // 206 means transcript unavailable for this video — not an error, just no captions.
    if (res.status === 206 || !res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[/api/lyrics] Supadata HTTP ${res.status} for ${videoId}:`, errBody.slice(0, 200));
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data.content)) {
      console.warn(`[/api/lyrics] Supadata unexpected response shape for ${videoId}:`, JSON.stringify(data).slice(0, 200));
      return null;
    }

    // AC-1.7: Reject junk tracks
    const rawCues = data.content as Array<{ text: string; offset: number; duration: number }>;
    const validCues = rawCues.filter((c) => c.text && c.text.trim().length >= 2);
    if (validCues.length < 3) return null;

    const trimmed = validCues.slice(0, MAX_CUES);

    // Supadata returns offset and duration in milliseconds, same as the InnerTube API.
    console.log(`[/api/lyrics] source: supadata (${trimmed.length} cues)`);
    return trimmed.map((c, i) => {
      const start = c.offset / 1000;
      const ownEnd = (c.offset + c.duration) / 1000;
      const nextStart = trimmed[i + 1] ? trimmed[i + 1].offset / 1000 : ownEnd;
      return {
        start,
        end: Math.max(ownEnd, nextStart),
        spanish: c.text.trim().replace(/\n/g, " "),
      };
    });
  } catch (err) {
    console.warn("[/api/lyrics] Supadata fetch failed:", err);
    return null;
  }
}

// --- Source 2: LRCLib (lrclib.net) ---

// LRCLib is a free community database of synced LRC lyrics. It requires a
// track name + artist to query, so we first fetch the video title via the
// YouTube oEmbed API (free, no key needed), then parse the artist/track out
// of the title string using common music video naming conventions.
async function fetchFromLRCLib(
  videoId: string
): Promise<Array<{ start: number; end: number; spanish: string }> | null> {
  try {
    // Step 1: Get video title + channel via oEmbed — free, no API key
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!oembedRes.ok) return null;
    const oembedData = await oembedRes.json();
    const rawTitle: string = oembedData.title ?? "";
    const channelName: string = oembedData.author_name ?? "";

    // Step 2: Parse "Artist - Track Title (Official Video)" into parts.
    // Music videos almost universally use " - " as the separator.
    const { artist, track } = parseMusicTitle(rawTitle, channelName);
    console.log(`[/api/lyrics] LRCLib: parsed title="${rawTitle}" → artist="${artist}" track="${track}"`);

    // Step 3: Query LRCLib. Try structured search first (more precise),
    // fall back to a plain query string if we couldn't parse artist/track.
    let lrcResult = null;
    if (artist && track) {
      lrcResult = await lrclibSearch({ track_name: track, artist_name: artist });
      if (!lrcResult) {
        console.log(`[/api/lyrics] LRCLib: structured search (artist="${artist}", track="${track}") returned no synced lyrics`);
      }
    }
    if (!lrcResult) {
      // Fallback: send the full raw title as a general query
      lrcResult = await lrclibSearch({ q: rawTitle });
      if (!lrcResult) {
        console.log(`[/api/lyrics] LRCLib: full-text search (q="${rawTitle}") returned no synced lyrics`);
      }
    }
    if (!lrcResult) return null;

    // Step 4: Parse LRC timestamp lines into cues
    const cues = parseLRC(lrcResult);
    if (!cues || cues.length < 3) return null;

    console.log(
      `[/api/lyrics] source: lrclib — "${artist}" / "${track}" (${cues.length} cues)`
    );
    return cues;
  } catch (err) {
    console.warn("[/api/lyrics] LRCLib fetch failed:", err);
    return null;
  }
}

// Parse a YouTube music video title into { artist, track }.
// Common patterns:
//   "Bad Bunny - MIA (Official Video)"
//   "Shakira: Waka Waka [Official Music Video]"
//   "J Balvin, Willy William - Mi Gente (Official Video)"
function parseMusicTitle(
  title: string,
  channelName: string
): { artist: string; track: string } {
  // Strip YouTube-standard suffixes from the track name portion
  const cleanTrack = (s: string) =>
    s
      .replace(/\s*[\(\[].*?[\)\]]/g, "") // remove (Official Video), [Audio], etc.
      .replace(/\s*(official|video|audio|lyric|lyrics|clip|hd|4k)\b.*/i, "")
      .trim();

  // Pattern 1: "Artist - Track" (most common for music)
  const dashIdx = title.indexOf(" - ");
  if (dashIdx !== -1) {
    const artist = title.slice(0, dashIdx).trim();
    const track = cleanTrack(title.slice(dashIdx + 3));
    if (artist && track) return { artist, track };
  }

  // Pattern 2: "Artist: Track"
  const colonIdx = title.indexOf(": ");
  if (colonIdx !== -1) {
    const artist = title.slice(0, colonIdx).trim();
    const track = cleanTrack(title.slice(colonIdx + 2));
    if (artist && track) return { artist, track };
  }

  // Fallback: use channel name as artist, full cleaned title as track
  return { artist: channelName, track: cleanTrack(title) };
}

// Hit the LRCLib search API. Returns the syncedLyrics string from the best
// match, or null if no synced result is found.
async function lrclibSearch(params: {
  track_name?: string;
  artist_name?: string;
  q?: string;
}): Promise<string | null> {
  const qs = new URLSearchParams();
  if (params.track_name) qs.set("track_name", params.track_name);
  if (params.artist_name) qs.set("artist_name", params.artist_name);
  if (params.q) qs.set("q", params.q);

  const res = await fetch(`https://lrclib.net/api/search?${qs.toString()}`, {
    headers: { "User-Agent": "Kantaro/1.0 (language learning app)" },
  });
  if (!res.ok) return null;

  const results = await res.json();
  if (!Array.isArray(results) || results.length === 0) {
    console.log(`[/api/lyrics] LRCLib: API returned 0 results for params=${JSON.stringify(params)}`);
    return null;
  }

  // Pick the first result that has synced (timestamped) lyrics
  const synced = results.find(
    (r: { syncedLyrics?: string | null }) =>
      r.syncedLyrics && r.syncedLyrics.trim().length > 0
  );
  const syncedCount = results.filter((r: { syncedLyrics?: string | null }) => r.syncedLyrics).length;
  console.log(`[/api/lyrics] LRCLib: ${results.length} results, ${syncedCount} with synced lyrics`);
  return synced?.syncedLyrics ?? null;
}

// Parse an LRC string into normalised cues.
// LRC line format: [mm:ss.xx]lyric text
// Instrumental/blank lines (e.g. "[01:23.45]") are skipped.
function parseLRC(
  lrc: string
): Array<{ start: number; end: number; spanish: string }> | null {
  const lines = lrc.split("\n");
  const CUE_RE = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;

  const timed: Array<{ start: number; text: string }> = [];
  for (const line of lines) {
    const m = line.trim().match(CUE_RE);
    if (!m) continue;
    const start = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    // Skip metadata tags (e.g. [ar:Artist], [ti:Title]) — they won't match CUE_RE
    // Skip blank/instrumental lines
    if (text.length < 2) continue;
    timed.push({ start, text });
  }

  if (timed.length < 3) return null;

  // Cap and build cues with end = next line's start
  const trimmed = timed.slice(0, MAX_CUES);
  return trimmed.map((c, i) => ({
    start: c.start,
    end: trimmed[i + 1]?.start ?? c.start + 5, // 5s for the last line
    spanish: c.text,
  }));
}

// --- Source 3: Genius + Gemini timestamp estimation ---

// Genius has near-universal lyrics coverage but no timestamps.
// We fetch the plain lyrics, then ask Gemini to estimate when each line
// occurs based on song structure (intro length, verse/chorus pacing, duration).
// Accuracy is ±5–15s — good enough to keep the active cue in the right section.
async function fetchFromGenius(
  videoId: string
): Promise<Array<{ start: number; end: number; spanish: string }> | null> {
  const geniusKey = process.env.GENIUS_API_KEY;
  if (!geniusKey || geniusKey.startsWith("your_")) {
    console.warn("[/api/lyrics] GENIUS_API_KEY not configured — skipping Genius fallback");
    return null;
  }

  try {
    // Step 1: Get title + channel via oEmbed (free, no key)
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (!oembedRes.ok) return null;
    const oembedData = await oembedRes.json();
    const rawTitle: string = oembedData.title ?? "";
    const channelName: string = oembedData.author_name ?? "";

    const { artist, track } = parseMusicTitle(rawTitle, channelName);
    console.log(`[/api/lyrics] Genius: searching artist="${artist}" track="${track}"`);

    // Step 2: Get video duration from YouTube Data API (needed for timestamp estimation)
    const ytKey = process.env.YOUTUBE_API_KEY;
    let durationSecs = 210; // sensible default (3.5 min) if API call fails
    if (ytKey) {
      const durRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=contentDetails&key=${ytKey}`
      );
      if (durRes.ok) {
        const durData = await durRes.json();
        const iso = durData.items?.[0]?.contentDetails?.duration ?? "";
        if (iso) durationSecs = parseIsoDuration(iso);
      }
    }

    // Step 3: Search Genius for the song
    const query = encodeURIComponent(`${artist} ${track}`);
    const searchRes = await fetch(`https://api.genius.com/search?q=${query}`, {
      headers: { Authorization: `Bearer ${geniusKey}` },
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const hits: Array<{ result: { url: string; primary_artist: { name: string }; title: string } }> =
      searchData.response?.hits ?? [];
    if (hits.length === 0) {
      console.log(`[/api/lyrics] Genius: no results for "${artist} ${track}"`);
      return null;
    }
    const lyricsUrl = hits[0].result.url;

    // Step 4: Scrape lyrics from the Genius page HTML
    const pageRes = await fetch(lyricsUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kantaro/1.0)" },
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Genius wraps lyrics in <div data-lyrics-container="true"> blocks.
    // We extract all such blocks and strip HTML tags to get plain text.
    const containerMatches = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g) ?? [];
    if (containerMatches.length === 0) {
      console.log(`[/api/lyrics] Genius: could not find lyrics container in page HTML`);
      return null;
    }

    const rawText = containerMatches
      .join("\n")
      .replace(/<br\s*\/?>/gi, "\n")   // <br> → newline before stripping tags
      .replace(/<[^>]+>/g, "")         // strip all remaining HTML tags
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'");

    // Filter out blank lines and section headers like [Verso 1], [Coro]
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 2 && !/^\[.*\]$/.test(l));

    if (lines.length < 3) {
      console.log(`[/api/lyrics] Genius: too few lyric lines (${lines.length})`);
      return null;
    }

    const trimmedLines = lines.slice(0, MAX_CUES);
    console.log(`[/api/lyrics] Genius: ${trimmedLines.length} lines scraped, estimating timestamps (duration=${durationSecs}s)`);

    // Step 5: Ask Gemini to estimate a timestamp for each lyric line
    const timestamps = await estimateTimestampsWithGemini(trimmedLines, artist, track, durationSecs);
    if (!timestamps) return null;

    const cues = trimmedLines.map((text, i) => ({
      start: timestamps[i],
      end: timestamps[i + 1] ?? timestamps[i] + 5,
      spanish: text,
    }));

    console.log(`[/api/lyrics] source: genius+gemini-timestamps — "${artist}" / "${track}" (${cues.length} cues, estimated sync)`);
    return cues;
  } catch (err) {
    console.warn("[/api/lyrics] Genius fetch failed:", err);
    return null;
  }
}

// Ask Gemini to estimate a start timestamp (in seconds) for each lyric line.
// Gemini reasons about typical song structure: intro length, verse/chorus pacing,
// outro. Not perfectly accurate but keeps the active cue in the right section.
async function estimateTimestampsWithGemini(
  lines: string[],
  artist: string,
  track: string,
  durationSecs: number
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) return null;

  try {
    const prompt = `You are estimating playback timestamps for song lyrics.

Song: "${artist}" — "${track}"
Total duration: ${durationSecs} seconds
Number of lyric lines: ${lines.length}

Estimate the start time in seconds for each lyric line based on typical song structure
(intro, verse, chorus, bridge, outro pacing). Return ONLY a valid JSON array of
${lines.length} numbers in ascending order, between 0 and ${durationSecs}.
First lyric typically begins 8–25 seconds in. Leave the last 5–10 seconds for outro.
Do not include markdown, code blocks, or explanation — just the JSON array.

Lyrics:
${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

    const raw = (await callGeminiWithFallback(apiKey, prompt)).trim()
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== lines.length) {
      console.warn(`[/api/lyrics] Gemini timestamp estimation returned wrong length: got ${parsed.length}, expected ${lines.length}`);
      return null;
    }

    // Ensure timestamps are numbers, ascending, and within bounds
    const clamped: number[] = [];
    for (const [i, t] of (parsed as number[]).entries()) {
      const prev = i > 0 ? clamped[i - 1] : 0;
      clamped.push(Math.max(prev, Math.min(Number(t) || prev + 3, durationSecs)));
    }
    return clamped;
  } catch (err) {
    console.warn("[/api/lyrics] Gemini timestamp estimation failed:", err);
    return null;
  }
}

// Parse an ISO 8601 duration string (e.g. "PT3M45S") into total seconds.
function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 3600) +
         (parseInt(m[2] || "0") * 60) +
         parseInt(m[3] || "0");
}

// Translation is handled by the shared lib/gemini-translate.ts utility.
