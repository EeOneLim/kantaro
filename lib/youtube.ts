import { YouTubeVideo, YouTubeChannel } from "@/types";

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
    }));
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

// Raw shape of a YouTube Data API search result item (video type).
// Only the fields we care about are typed here.
interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    channelId?: string;
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
