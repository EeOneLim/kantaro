"use client";

import { YouTubeVideo } from "@/types";
import VideoCard from "./VideoCard";

interface VideoGridProps {
  videos: YouTubeVideo[];
  selectedId: string | null;
  onSelect: (video: YouTubeVideo) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function VideoGrid({
  videos,
  selectedId,
  onSelect,
  isLoading,
  error,
}: VideoGridProps) {
  if (isLoading) {
    // Skeleton cards that match the VideoCard dimensions
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[10px] bg-surface border border-border overflow-hidden animate-pulse"
          >
            <div className="aspect-video bg-border" />
            <div className="p-2 space-y-2">
              <div className="h-3 bg-border rounded w-3/4" />
              <div className="h-3 bg-border rounded w-1/2" />
              <div className="h-3 bg-border rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted">
        <p>{error}</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        <p>No results found. Try a different search.</p>
      </div>
    );
  }

  return (
    // animate-fade-in: defined in globals.css — results slide up gently on mount
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          isSelected={video.id === selectedId}
          onClick={() => onSelect(video)}
        />
      ))}
    </div>
  );
}
