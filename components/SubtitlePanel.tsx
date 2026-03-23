"use client";

import { useEffect, useRef } from "react";
import { LyricCue } from "@/types";

interface SubtitlePanelProps {
  cues: LyricCue[];
  activeCueIndex: number;   // -1 means no active cue (e.g. instrumental intro)
  isLoading: boolean;
  error: string | null;     // "no_captions" | "fetch_failed" | null
}

export default function SubtitlePanel({
  cues,
  activeCueIndex,
  isLoading,
  error,
}: SubtitlePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const activeCueRef = useRef<HTMLDivElement>(null);

  // userScrolled is a ref (not state) so toggling it never causes a re-render
  const userScrolledRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AC-4.1/4.2: Auto-scroll the active cue into view (smooth, panel only)
  useEffect(() => {
    if (activeCueIndex === -1) return;
    if (userScrolledRef.current) return;
    activeCueRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeCueIndex]);

  // AC-4.3: If the user manually scrolls, pause auto-scroll for 3 seconds
  function handleScroll() {
    userScrolledRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 3000);
  }

  // Shared outer shell — fixed height on mobile; on desktop, fills the absolutely
  // positioned wrapper in page.tsx (which is locked to the player's height).
  const shell =
    "h-48 lg:h-full flex flex-col bg-surface rounded-lg border border-border overflow-hidden";

  // ── Loading state: pulsing amber mic icon (AC-7.1) ──────────────────────────
  if (isLoading) {
    return (
      <div className={`${shell} items-center justify-center`}>
        <span className="text-4xl animate-mic-pulse" style={{ color: "var(--color-accent)" }}>
          🎤
        </span>
      </div>
    );
  }

  // ── Error / no captions state ────────────────────────────────────────────────
  if (error || cues.length === 0) {
    const message =
      error === "no_captions"
        ? "No lyrics available for this song."
        : "Couldn't load lyrics. The player still works!";
    return (
      <div className={`${shell} items-center justify-center px-4`}>
        <p className="text-muted text-sm text-center">{message}</p>
      </div>
    );
  }

  // ── Lyrics list ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      onScroll={handleScroll}
      // AC-4.4: overflow-y-auto here — the panel scrolls; the window does not
      className={`${shell} overflow-y-auto p-2 space-y-0.5 scrollbar-hide`}
    >
      {cues.map((cue, i) => {
        const isActive = i === activeCueIndex;
        return (
          <div
            key={i}
            ref={isActive ? activeCueRef : null}
            className={`px-3 py-2 rounded-md transition-all duration-200 border-l-2 ${
              isActive
                ? "border-accent bg-accent/5 opacity-100"
                : "border-transparent opacity-35"
            }`}
          >
            {/*
             * Spanish line — each word is a separate <span> so Phase 3 can attach
             * tap-to-define without refactoring this component (AC-5.1 prep)
             */}
            <p
              className={`font-medium leading-snug ${
                isActive ? "text-accent text-sm" : "text-foreground text-xs"
              }`}
            >
              {cue.spanish.split(" ").map((word, wi, arr) => (
                <span
                  key={wi}
                  // data-word makes Phase 3 lookup trivial — no regex needed later
                  data-word={word.replace(/[.,!?¡¿;:"""]/g, "")}
                  className="cursor-pointer hover:text-accent-hover transition-colors"
                >
                  {word}
                  {wi < arr.length - 1 ? " " : ""}
                </span>
              ))}
            </p>

            {/* English translation — always one size smaller than Spanish */}
            <p className="text-muted text-xs leading-snug mt-0.5">
              {cue.english}
            </p>
          </div>
        );
      })}
    </div>
  );
}
