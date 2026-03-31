import { NextRequest, NextResponse } from "next/server";
import { parseSearchResults, parseChannelResults } from "@/lib/youtube";

// Secure proxy between the browser and YouTube's API.
// The API key never leaves the server — the browser only calls /api/search.
//
// Query params:
//   q     — search query (required)
//   type  — "video" (default) or "channel"
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q");
  const type = searchParams.get("type") ?? "video";

  if (!query) {
    return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type,
    maxResults: "12",
    // Bias results toward Spanish-language content without hard-restricting.
    // Searching "Bad Bunny" still works; searching "happy songs" leans Spanish.
    relevanceLanguage: "es",
    key: apiKey,
    // Only include videos that can be embedded — filters out Vevo/label-blocked content.
    // Only valid when type=video; ignored for channel searches.
    ...(type === "video" && { videoEmbeddable: "true" }),
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`
  );

  if (!response.ok) {
    return NextResponse.json({ error: "YouTube API error" }, { status: response.status });
  }

  const data = await response.json();

  if (type === "channel") {
    const channels = parseChannelResults(data.items ?? []);
    return NextResponse.json({ channels });
  }

  const videos = parseSearchResults(data.items ?? []);
  return NextResponse.json({ videos });
}
