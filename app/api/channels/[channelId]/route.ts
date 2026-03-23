import { NextRequest, NextResponse } from "next/server";
import { parseSearchResults } from "@/lib/youtube";

// Fetches recent videos for a specific channel.
// Used when the user clicks a channel card on the landing page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  // In Next.js 15+, route segment params are async
  const { channelId } = await params;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const searchParams = new URLSearchParams({
    part: "snippet",
    channelId,
    type: "video",
    maxResults: "12",
    order: "date",
    key: apiKey,
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams}`
  );

  if (!response.ok) {
    return NextResponse.json({ error: "YouTube API error" }, { status: response.status });
  }

  const data = await response.json();
  const videos = parseSearchResults(data.items ?? []);
  return NextResponse.json({ videos });
}
