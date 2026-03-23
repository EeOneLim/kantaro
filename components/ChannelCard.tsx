"use client";

import Image from "next/image";
import { YouTubeChannel } from "@/types";

interface ChannelCardProps {
  channel: YouTubeChannel;
  onClick: () => void;
}

export default function ChannelCard({ channel, onClick }: ChannelCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`Browse ${channel.name}`}
      className="group flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-surface transition-colors min-w-[80px]"
    >
      {/* Circular avatar */}
      <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-border group-hover:border-accent transition-colors flex-shrink-0">
        {channel.thumbnail ? (
          <Image
            src={channel.thumbnail}
            alt={channel.name}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          // Fallback: first letter of channel name
          <div className="w-full h-full bg-surface flex items-center justify-center text-muted text-lg font-semibold">
            {channel.name[0]}
          </div>
        )}
      </div>

      <span className="text-xs text-muted group-hover:text-foreground transition-colors text-center w-[80px] truncate">
        {channel.name}
      </span>
    </button>
  );
}
