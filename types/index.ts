// Represents a single video result from the YouTube Data API v3
export interface YouTubeVideo {
  id: string;           // YouTube video ID (used to build embed URLs)
  title: string;
  channelName: string;
  channelId: string;    // Kept for future channel-browsing features (Phase 2+)
  thumbnail: string;    // URL to the video's thumbnail image
}

// Represents a YouTube channel returned by a channel-type search
export interface YouTubeChannel {
  id: string;
  name: string;
  thumbnail: string;    // Channel avatar URL
}

// A single timestamped lyric line with both Spanish source and English translation.
// start/end are in seconds from the beginning of the video.
export interface LyricCue {
  start: number;    // seconds
  end: number;      // seconds
  spanish: string;
  english: string;
}

// A word definition returned by the /api/define route (Phase 3)
export interface WordDefinition {
  word: string;
  pos: string;          // "noun" | "verb" | "adjective" | etc.
  definition: string;
  example: {
    spanish: string;
    english: string;
  };
}
