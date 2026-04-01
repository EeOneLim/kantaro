import { NextRequest, NextResponse } from "next/server";
import { parseSearchResults, youtubeApiFetch } from "@/lib/youtube";

// Fetches recent videos for a specific channel.
// Used when the user clicks a channel card on the landing page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  // In Next.js 15+, route segment params are async
  const { channelId } = await params;

  if (!process.env.YOUTUBE_API_KEY) {
    console.error("YOUTUBE_API_KEY is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("order", "date");
  // Only include videos that can be embedded — filters out Vevo/label-blocked content.
  url.searchParams.set("videoEmbeddable", "true");

  const response = await youtubeApiFetch(url);

  if (!response.ok) {
    return NextResponse.json({ error: "YouTube API error" }, { status: response.status });
  }

  const data = await response.json();
  const videos = parseSearchResults(data.items ?? []);
  return NextResponse.json({ videos });
}
