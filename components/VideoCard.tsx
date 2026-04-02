"use client";

import Image from "next/image";
import { YouTubeVideo } from "@/types";
import { formatViewCount, formatRelativeTime } from "@/lib/youtube";

interface VideoCardProps {
  video: YouTubeVideo;
  isSelected: boolean;
  onClick: () => void;
}

export default function VideoCard({ video, isSelected, onClick }: VideoCardProps) {
  // Build the "2.4M views • 2 days ago" string — omit any part that's unavailable
  const meta = [
    video.viewCount ? formatViewCount(video.viewCount) : null,
    video.publishedAt ? formatRelativeTime(video.publishedAt) : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <button
      onClick={onClick}
      aria-label={`Play ${video.title}`}
      className={`
        group w-full text-left rounded-xl overflow-hidden border
        bg-surface transition-all duration-150
        ${
          isSelected
            ? "border-accent shadow-[0_0_0_2px_var(--color-accent)]"
            : "border-border hover:border-accent/50 hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(188,1,0,0.12)]"
        }
      `}
    >
      {/* 16:9 thumbnail — full width on mobile */}
      <div className="relative w-full aspect-video">
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 33vw, 20vw"
        />
      </div>

      {/* Title + channel + views/time */}
      <div className="p-2">
        <p className="text-foreground text-sm font-medium line-clamp-2 leading-snug">
          {video.title}
        </p>
        <p className="text-muted text-xs mt-1 truncate">{video.channelName}</p>
        {meta && (
          <p className="text-muted text-xs mt-0.5 truncate">{meta}</p>
        )}
      </div>
    </button>
  );
}
