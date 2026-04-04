import { YouTubeVideo, YouTubeChannel } from "@/types";

// Fetches a YouTube Data API URL, automatically falling back through up to three
// API keys if any returns 403 (quota exceeded). Each key should be from a
// separate Google Cloud project so they have independent quota pools.
export async function youtubeApiFetch(url: URL): Promise<Response> {
  const keys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
  ].filter(Boolean) as string[];

  if (keys.length === 0) throw new Error("YOUTUBE_API_KEY is not set");

  let lastRes: Response | null = null;
  for (let i = 0; i < keys.length; i++) {
    url.searchParams.set("key", keys[i]);
    const res = await fetch(url.toString());
    if (res.status !== 403) return res;
    console.warn(`YouTube API key ${i + 1} quota exceeded, trying next key`);
    lastRes = res;
  }

  // All keys exhausted — return the last 403 response so callers can handle it
  return lastRes!;
}

// The YouTube Data API returns deeply nested objects.
// These functions extract only what we need, keeping the rest of the app
// insulated from API response shape changes.

// Detects compilation/mix-style video titles — these videos are filtered out
// sitewide because lyrics services rarely have data for them, making them
// useless for language learning. Word boundaries (\b) prevent false positives
// on normal song titles that happen to contain these substrings
// (e.g. "Best Of Times" does not match "best of").
const COMPILATION_PATTERN =
  /\b(mix|playlist|compilation|megamix|nonstop|non[- ]stop|mashup|medley|mixtape|best of|top \d+|top songs|top hits|greatest hits|all songs|full album|collection|vol\.|volume|part \d|pt\.?\s*\d|\d+\s*songs|\d+\s*(hour|hr)s?|hours? of|lo mejor|grandes\s+[eé]xitos|recopilaci[oó]n|music party|latin party|latino party)\b/i;

export function isCompilationVideo(title: string): boolean {
  return COMPILATION_PATTERN.test(title);
}

export function parseSearchResults(items: YouTubeSearchItem[]): YouTubeVideo[] {
  return items
    .filter((item) => item.id?.videoId) // exclude playlists/channels from results
    .map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      channelId: item.snippet.channelId ?? "",
      // Use the highest-quality thumbnail available, fall back through sizes
      thumbnail:
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.medium?.url ??
        "",
      publishedAt: item.snippet.publishedAt,
    }));
}

// Format a raw view count string into a compact human-readable string.
// e.g. "2400000" → "2.4M views", "890000" → "890K views", "500" → "500 views"
export function formatViewCount(count: string): string {
  const n = parseInt(count, 10);
  if (isNaN(n)) return "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K views`;
  return `${n} views`;
}

// Convert an ISO 8601 date string to a relative time string.
// e.g. "2024-01-13T12:00:00Z" → "2 days ago"
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 4) return `${diffWk} week${diffWk === 1 ? "" : "s"} ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? "" : "s"} ago`;
  const diffYr = Math.floor(diffDay / 365);
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
}

export function parseChannelResults(items: YouTubeChannelItem[]): YouTubeChannel[] {
  return items
    .filter((item) => item.id?.channelId)
    .map((item) => ({
      id: item.id.channelId,
      name: item.snippet.channelTitle,
      // Channel avatars are smaller; prefer medium over high for the avatar row
      thumbnail:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        "",
    }));
}

// Fetches view counts for a list of video IDs in a single batch request and
// merges the counts back onto the video objects. If the call fails for any
// reason the original videos are returned unmodified (AC-11.2).
export async function mergeViewCounts(videos: YouTubeVideo[]): Promise<YouTubeVideo[]> {
  if (videos.length === 0) return videos;

  const ids = videos.map((v) => v.id).join(",");
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", ids);

  try {
    const res = await youtubeApiFetch(url);
    if (!res.ok) return videos;

    const data = await res.json();
    const countMap: Record<string, string> = {};
    for (const item of data.items ?? []) {
      countMap[item.id] = item.statistics?.viewCount ?? "";
    }

    return videos.map((v) => ({
      ...v,
      viewCount: countMap[v.id] ?? v.viewCount,
    }));
  } catch {
    // Network or parse error — return videos without view counts
    return videos;
  }
}

// Raw shape of a YouTube Data API search result item (video type).
// Only the fields we care about are typed here.
interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

// Raw shape of a YouTube Data API search result item (channel type).
interface YouTubeChannelItem {
  id: { channelId: string };
  snippet: {
    channelTitle: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}
