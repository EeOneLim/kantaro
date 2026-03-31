"use client";

interface Props {
  onExpand: () => void;
  onClose: () => void;
}

// Overlay rendered on top of the miniplayer (fixed bottom-right corner box).
// Provides always-visible expand (⤢) and close (✕) controls with a gradient
// scrim so the buttons stay readable against any video content.
export default function MiniPlayerControls({ onExpand, onClose }: Props) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* Dark gradient scrim at top — keeps buttons legible over the video */}
      <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-black/70 to-transparent" />

      {/* ⤢ Expand — top-left */}
      <button
        onClick={onExpand}
        className="absolute top-1.5 left-2 pointer-events-auto text-white/90 hover:text-white text-base leading-none transition-colors"
        aria-label="Expand player"
      >
        ⤢
      </button>

      {/* ✕ Close — top-right */}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-2 pointer-events-auto text-white/90 hover:text-white text-base leading-none transition-colors"
        aria-label="Close player"
      >
        ✕
      </button>
    </div>
  );
}
