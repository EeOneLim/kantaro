"use client";

import { useState, useEffect } from "react";
import YouTube, { YouTubeProps, YouTubeEvent } from "react-youtube";

// Minimal interface for the parts of the YouTube IFrame player we actually use.
// This avoids a dependency on @types/youtube while keeping TypeScript happy.
export interface YouTubePlayerInstance {
  getCurrentTime: () => number;
  getPlayerState: () => number;
}

interface PlayerProps {
  videoId: string;
  // Phase 2: called once the IFrame player is ready; gives us the player ref
  // so the sync engine in page.tsx can call getCurrentTime()
  onPlayerReady?: (player: YouTubePlayerInstance) => void;
  // Phase 2: called on every player state change (play / pause / buffer / end)
  // State values: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering
  onPlayerStateChange?: (state: number) => void;
}

// We use the IFrame Player API (via react-youtube) instead of a plain <iframe>.
// Reason: Phase 2 needs player.getCurrentTime() for subtitle sync.
// A plain iframe can't expose that method; the IFrame API can.
export default function Player({
  videoId,
  onPlayerReady,
  onPlayerStateChange,
}: PlayerProps) {
  // IFrame API error codes 101 and 150 mean the rights holder has blocked
  // embedding on third-party sites (e.g. NFL, Vevo). We can't suppress YouTube's
  // own error UI inside the iframe, so we overlay our own message on top.
  const [embedBlocked, setEmbedBlocked] = useState(false);

  // Reset blocked state whenever the video changes — onReady only fires once
  // on initial mount, so we can't rely on it to clear stale error state.
  useEffect(() => {
    setEmbedBlocked(false);
  }, [videoId]);

  const opts: YouTubeProps["opts"] = {
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 1,
      // Don't show related videos from other channels at the end — keep the user in-app
      rel: 0,
    },
  };

  function handleReady(event: YouTubeEvent) {
    // Clear any previous embed-blocked state when a new video loads successfully
    setEmbedBlocked(false);
    onPlayerReady?.(event.target as YouTubePlayerInstance);
  }

  function handleStateChange(event: YouTubeEvent<number>) {
    onPlayerStateChange?.(event.data);
  }

  function handleError(event: YouTubeEvent<number>) {
    // 101 / 150: owner does not allow embedding on third-party sites
    if (event.data === 101 || event.data === 150) {
      setEmbedBlocked(true);
    }
  }

  return (
    // Wrapper enforces 16:9 aspect ratio; the YouTube component fills it absolutely
    <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-lg shadow-black/50">
      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        onError={handleError}
        className="absolute inset-0 w-full h-full"
        iframeClassName="w-full h-full"
      />

      {/* Overlay that appears when the rights holder blocks third-party embedding.
          Sits above the iframe so the broken YouTube error UI is hidden. */}
      {embedBlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-3 p-6 text-center">
          <span className="text-3xl">🔒</span>
          <p className="text-foreground font-medium">
            This video only shows up at its home on YouTube.
          </p>
          <p className="text-muted text-sm">
            (We tried. It said no.)
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 px-4 py-2 rounded-full bg-accent text-background text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            Watch on YouTube
          </a>
        </div>
      )}
    </div>
  );
}
