"use client";

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
    onPlayerReady?.(event.target as YouTubePlayerInstance);
  }

  function handleStateChange(event: YouTubeEvent<number>) {
    onPlayerStateChange?.(event.data);
  }

  return (
    // Wrapper enforces 16:9 aspect ratio; the YouTube component fills it absolutely
    <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow-lg shadow-black/50">
      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        className="absolute inset-0 w-full h-full"
        iframeClassName="w-full h-full"
      />
    </div>
  );
}
