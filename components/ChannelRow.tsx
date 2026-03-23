"use client";

import { YouTubeChannel } from "@/types";
import ChannelCard from "./ChannelCard";

interface ChannelRowProps {
  channels: YouTubeChannel[];
  onSelectChannel: (channel: YouTubeChannel) => void;
}

export default function ChannelRow({ channels, onSelectChannel }: ChannelRowProps) {
  if (channels.length === 0) return null;

  return (
    // scrollbar-hide: hides the scrollbar visually without disabling scroll (defined in globals.css)
    <div className="flex gap-2 overflow-x-auto pb-2 px-4 scrollbar-hide">
      {channels.map((channel) => (
        <ChannelCard
          key={channel.id}
          channel={channel}
          onClick={() => onSelectChannel(channel)}
        />
      ))}
    </div>
  );
}
