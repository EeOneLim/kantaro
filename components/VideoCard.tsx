"use client";

import Image from "next/image";
import { YouTubeVideo } from "@/types";

interface VideoCardProps {
  video: YouTubeVideo;
  isSelected: boolean;
  onClick: () => void;
}

export default function VideoCard({ video, isSelected, onClick }: VideoCardProps) {
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
      {/* 16:9 thumbnail */}
      <div className="relative w-full aspect-video">
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
      </div>

      {/* Title + channel */}
      <div className="p-2">
        <p className="text-foreground text-sm font-medium line-clamp-2 leading-snug">
          {video.title}
        </p>
        <p className="text-muted text-xs mt-1 truncate">{video.channelName}</p>
      </div>
    </button>
  );
}
