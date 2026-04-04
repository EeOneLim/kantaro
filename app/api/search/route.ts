import { NextRequest, NextResponse } from "next/server";
import { parseSearchResults, parseChannelResults, youtubeApiFetch, mergeViewCounts } from "@/lib/youtube";

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

  if (!process.env.YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", type);
  url.searchParams.set("maxResults", "12");
  // Bias results toward Spanish-language content without hard-restricting.
  // Searching "Bad Bunny" still works; searching "happy songs" leans Spanish.
  url.searchParams.set("relevanceLanguage", "es");
  // Only include videos that can be embedded — filters out Vevo/label-blocked content.
  // Only valid when type=video; ignored for channel searches.
  if (type === "video") url.searchParams.set("videoEmbeddable", "true");

  const response = await youtubeApiFetch(url);

  if (!response.ok) {
    return NextResponse.json({ error: "YouTube API error" }, { status: response.status });
  }

  const data = await response.json();

  if (type === "channel") {
    const channels = parseChannelResults(data.items ?? []);
    return NextResponse.json({ channels });
  }

  const videos = await mergeViewCounts(parseSearchResults(data.items ?? []));
  return NextResponse.json({ videos });
}
