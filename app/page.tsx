"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { YouTubeVideo, YouTubeChannel, LyricCue } from "@/types";
import SearchBar from "@/components/SearchBar";
import VideoGrid from "@/components/VideoGrid";
import Player, { YouTubePlayerInstance } from "@/components/Player";
import SubtitlePanel from "@/components/SubtitlePanel";
import ChannelRow from "@/components/ChannelRow";
import Hero from "@/components/Hero";
import SectionLabel from "@/components/SectionLabel";

// The app has three modes:
//   landing — hero + channel row + popular videos; no search has happened yet
//   search  — user submitted a query; showing search results
//   channel — user tapped a channel card; showing that channel's videos
type AppState = "landing" | "search" | "channel";

export default function Home() {
  // ── Core app state ──────────────────────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("landing");
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [popularVideos, setPopularVideos] = useState<YouTubeVideo[]>([]);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [activeChannel, setActiveChannel] = useState<YouTubeChannel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Phase 2: lyrics + sync state ───────────────────────────────────────────
  const [lyrics, setLyrics] = useState<LyricCue[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [activeCueIndex, setActiveCueIndex] = useState(-1);
  // Client-side cache so switching back to a video doesn't re-fetch (AC-8.4)
  const lyricsCacheRef = useRef<Record<string, LyricCue[]>>({});

  // ── Refs ────────────────────────────────────────────────────────────────────
  // Scroll target for mobile (scroll player into view when a video is picked)
  const playerContainerRef = useRef<HTMLDivElement>(null);
  // The live YouTube IFrame player instance — used to call getCurrentTime()
  const youtubePlayerRef = useRef<YouTubePlayerInstance | null>(null);
  // The setInterval handle for the 250ms sync polling loop
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to lyrics so the interval closure always reads fresh data
  const lyricsRef = useRef<LyricCue[]>([]);

  // Keep lyricsRef in sync with the lyrics state
  useEffect(() => {
    lyricsRef.current = lyrics;
  }, [lyrics]);

  // ── Sync engine ─────────────────────────────────────────────────────────────

  // Stop polling — called on pause, video end, unmount, or video switch
  const stopSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // Start the 250ms poll loop (AC-3.1)
  const startSync = useCallback(() => {
    stopSync(); // clear any existing interval first
    syncIntervalRef.current = setInterval(() => {
      const player = youtubePlayerRef.current;
      const cues = lyricsRef.current;
      if (!player || cues.length === 0) return;

      const time = player.getCurrentTime();

      // Find the cue whose window contains the current playback time (AC-3.2)
      // We use the next cue's start as the upper bound to handle gaps between lines
      let found = -1;
      for (let i = 0; i < cues.length; i++) {
        const nextStart = cues[i + 1]?.start ?? Infinity;
        if (time >= cues[i].start && time < nextStart) {
          found = i;
          break;
        }
      }
      setActiveCueIndex(found);
    }, 250);
  }, [stopSync]);

  // Called by Player when the IFrame API is initialised (AC-3.1 setup)
  function handlePlayerReady(player: YouTubePlayerInstance) {
    youtubePlayerRef.current = player;
  }

  // Called by Player on every state change
  // AC-1.6: We only start sync on state 1 (playing).
  // During pre-roll ads the player also emits state 1, but getCurrentTime()
  // returns the ad position (near 0) so no cue matches — the panel simply shows
  // nothing highlighted until the actual video content begins.
  function handlePlayerStateChange(state: number) {
    if (state === 1) {
      // Playing — start or resume sync
      startSync();
    } else {
      // Paused (2), ended (0), buffering (3), or unstarted (-1) — stop sync
      stopSync();
    }
    // When video ends, keep the last active cue highlighted (AC-T-11)
    if (state === 0) {
      // "ended" — don't reset activeCueIndex
    }
  }

  // Clean up the sync interval when the component unmounts (AC-3.7)
  useEffect(() => {
    return () => stopSync();
  }, [stopSync]);

  // ── Landing content prefetch ─────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchChannels(), fetchPopularVideos()]).finally(() =>
      setPopularLoading(false)
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchChannels() {
    try {
      const res = await fetch("/api/search?q=cantante+latino&type=channel");
      if (res.ok) {
        const data = await res.json();
        const NON_ARTIST_PATTERN =
          /\b(records|music|tv|hits|mix|playlist|radio|label|entertainment|network|vevo)\b/i;
        const artists = (data.channels ?? []).filter(
          (ch: { name: string }) => !NON_ARTIST_PATTERN.test(ch.name)
        );
        setChannels(artists);
      }
    } catch {
      // Non-critical — the channel row just won't render
    }
  }

  async function fetchPopularVideos() {
    try {
      const res = await fetch("/api/search?q=música+latina+popular");
      if (res.ok) {
        const data = await res.json();
        setPopularVideos(data.videos ?? []);
      }
    } catch {
      // Non-critical — the popular grid just won't render
    }
  }

  // ── Lyrics fetch ─────────────────────────────────────────────────────────────
  async function fetchLyrics(videoId: string) {
    // AC-8.4: Serve from cache if already fetched this session
    if (lyricsCacheRef.current[videoId]) {
      setLyrics(lyricsCacheRef.current[videoId]);
      setLyricsLoading(false);
      setLyricsError(null);
      return;
    }

    setLyricsLoading(true);
    setLyricsError(null);
    setLyrics([]);
    setActiveCueIndex(-1);

    try {
      const res = await fetch(`/api/lyrics?videoId=${videoId}`);
      const data = await res.json();

      if (!res.ok) {
        // 404 with no_captions is an expected state, not a crash
        setLyricsError(data.error ?? "fetch_failed");
        return;
      }

      const cues: LyricCue[] = data.cues ?? [];
      lyricsCacheRef.current[videoId] = cues; // populate cache
      setLyrics(cues);
    } catch {
      setLyricsError("fetch_failed");
    } finally {
      setLyricsLoading(false);
    }
  }

  // ── User actions ─────────────────────────────────────────────────────────────
  async function handleSearch(q: string) {
    setQuery(q);
    setIsLoading(true);
    setError(null);
    setAppState("search");
    // Per PRD: player keeps playing when a new search runs — don't clear selectedVideo

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setVideos(data.videos ?? []);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectChannel(channel: YouTubeChannel) {
    setActiveChannel(channel);
    setIsLoading(true);
    setError(null);
    setAppState("channel");

    try {
      const res = await fetch(`/api/channels/${channel.id}`);
      if (!res.ok) throw new Error("Failed to load channel");
      const data = await res.json();
      setVideos(data.videos ?? []);
    } catch {
      setError("Failed to load channel. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectVideo(video: YouTubeVideo) {
    // AC-1.5: Switching videos clears previous lyrics immediately
    stopSync();
    setActiveCueIndex(-1);
    setSelectedVideo(video);

    // AC-1.2: Lyrics fetch begins immediately on video selection
    fetchLyrics(video.id);

    // On mobile the player is above the grid; scroll it into view smoothly
    setTimeout(() => {
      playerContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function handleBackToLanding() {
    stopSync();
    setAppState("landing");
    setActiveChannel(null);
    setVideos([]);
    setSelectedVideo(null);
    setQuery("");
    setError(null);
    setLyrics([]);
    setLyricsError(null);
    setActiveCueIndex(-1);
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  // Landing is only "true landing" when no video is playing.
  // Selecting a popular video transitions us out of the hero into the player layout.
  const isLanding = appState === "landing" && selectedVideo === null;

  const displayedVideos =
    appState === "search" || appState === "channel" ? videos : popularVideos;

  const gridLoading = appState === "landing" ? popularLoading : isLoading;

  // The subtitle panel is only rendered when a video is selected (AC-6.3 / AC-6.4)
  const showSubtitlePanel = selectedVideo !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header ── shown once the user has left the landing state */}
      {!isLanding && (
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="max-w-screen-xl mx-auto flex items-center gap-4">
            <button
              onClick={handleBackToLanding}
              className="font-[family-name:var(--font-sora)] font-bold text-xl text-accent whitespace-nowrap"
            >
              Kantaro
            </button>

            {appState === "channel" && activeChannel && (
              <span className="text-muted text-sm whitespace-nowrap hidden sm:inline truncate max-w-[160px]">
                / {activeChannel.name}
              </span>
            )}

            <div className="flex-1 max-w-lg">
              <SearchBar onSearch={handleSearch} initialValue={query} />
            </div>
          </div>
        </header>
      )}

      {/* ── Landing hero ── only shown before any search or video selection */}
      {isLanding && <Hero onSearch={handleSearch} />}

      {/* ── Main content ── */}
      <main className="max-w-screen-xl mx-auto px-4 py-4">
        {/* ── Landing page ── channel row + popular grid */}
        {isLanding && (
          <>
            {channels.length > 0 && (
              <section className="mb-6 -mx-4">
                <div className="px-4 mb-3">
                  <SectionLabel>Popular Artists</SectionLabel>
                </div>
                <ChannelRow
                  channels={channels}
                  onSelectChannel={handleSelectChannel}
                />
              </section>
            )}

            <section>
              <SectionLabel>Popular right now</SectionLabel>
              <VideoGrid
                videos={popularVideos}
                selectedId={null}
                onSelect={handleSelectVideo}
                isLoading={popularLoading}
                error={null}
              />
            </section>
          </>
        )}

        {/* ── Post-landing layout ── */}
        {!isLanding && (
          <div className="space-y-4">
            {/*
             * TOP ROW
             * Mobile:  player stacked above subtitle panel (natural block flow)
             * Desktop: player (3/4) left | subtitle panel (1/4) right — same height
             * AC-6.1, AC-6.2
             */}
            <div
              className="lg:flex lg:gap-4 lg:items-stretch"
              ref={playerContainerRef}
            >
              {/* Player — 3/4 width on desktop */}
              <div className="lg:w-3/4 mb-3 lg:mb-0">
                {selectedVideo ? (
                  <Player
                    videoId={selectedVideo.id}
                    onPlayerReady={handlePlayerReady}
                    onPlayerStateChange={handlePlayerStateChange}
                  />
                ) : (
                  // Placeholder before the user picks a video
                  <div className="w-full aspect-video rounded-lg bg-surface border border-border flex items-center justify-center text-muted text-sm">
                    Select a video to play
                  </div>
                )}
              </div>

              {/* Subtitle panel — 1/4 width on desktop, same height as player
                  Hidden entirely on both mobile and desktop if no video selected (AC-6.3/6.4) */}
              {showSubtitlePanel && (
                /*
                 * Desktop height trick: the column is `relative` and stretches to
                 * match the player via `items-stretch`. The inner absolute wrapper
                 * fills it exactly (inset-0), giving SubtitlePanel a locked container
                 * height so `overflow-y-auto` actually constrains the scroll area.
                 */
                <div className="lg:w-1/4 lg:relative">
                  <div className="lg:absolute lg:inset-0">
                    <SubtitlePanel
                      cues={lyrics}
                      activeCueIndex={activeCueIndex}
                      isLoading={lyricsLoading}
                      error={lyricsError}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* BOTTOM ROW — full-width results grid (AC-6.2) */}
            <div>
              {appState === "channel" && activeChannel && (
                <div className="mb-4">
                  <button
                    onClick={handleBackToLanding}
                    className="text-muted text-sm hover:text-foreground transition-colors mb-2 flex items-center gap-1"
                  >
                    ← Back
                  </button>
                  <SectionLabel>{activeChannel.name}</SectionLabel>
                </div>
              )}

              {appState === "landing" && (
                <div className="mb-4">
                  <SectionLabel>Popular right now</SectionLabel>
                </div>
              )}

              <VideoGrid
                videos={displayedVideos}
                selectedId={selectedVideo?.id ?? null}
                onSelect={handleSelectVideo}
                isLoading={gridLoading}
                error={error}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
