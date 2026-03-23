# Kantaro

## What is this project?

Kantaro is a web app for learning Spanish through music. Users search for Spanish songs, play them inline, and see synced dual subtitles (Spanish + English translation) with tap-to-learn word definitions. Think of it as a music-first language learning tool — the user never leaves the app.

## Current phase

**Phase 1 is complete.** Phase 2 is next: synced dual subtitles below the player.

---

## Phase 1 — Complete

### What was built

- **Landing page** — hero headline, embedded search bar, horizontally scrollable Popular Artists row (auto-fetched channels), Popular right now video grid (auto-fetched on load)
- **Search** — user types a query, results replace the grid; search bar moves to a sticky header after first search
- **Channel view** — clicking a channel card fetches and displays that channel's videos
- **Player** — YouTube IFrame Player API via `react-youtube`; autoplay on card select; switching cards replaces the video in the same player instance
- **Layouts** — mobile: player above grid, stacked; desktop: two-column (player left ~45%, results right ~55%, player sticky while results scroll)

### Key decisions made

| Decision | What we chose | Why |
|---|---|---|
| YouTube player library | `react-youtube` (IFrame API), not a plain `<iframe>` | Phase 2 needs `player.getCurrentTime()` for subtitle sync — a plain iframe can't expose that |
| API key security | Key lives in `.env.local`, accessed only via Next.js API routes | Browser never sees the key; routes act as a secure proxy |
| Search scoping | `relevanceLanguage=es` on all video queries | Biases results toward Spanish without blocking artist name searches like "Bad Bunny" |
| App state | Three modes in `page.tsx`: `landing`, `search`, `channel` | Simple enough for Phase 1; all state is `useState` — no external state library needed yet |
| "Landing with video" | Selecting a popular video flips `isLanding` to false (computed, not a separate state) | Avoids a fourth state; the hero naturally gives way to the player layout |
| Typography | Sora (headings/logo) + DM Sans (body) | Sora is geometric and editorial; DM Sans is warm and readable at small sizes |
| Image domains | `i.ytimg.com`, `yt3.ggpht.com`, `yt3.googleusercontent.com` in `next.config.ts` | Required for `next/image` to serve YouTube thumbnails and channel avatars |

### File map

```
app/
  page.tsx                        — all app state and layout logic
  globals.css                     — design tokens, fadeIn animation, scrollbar-hide
  api/
    search/route.ts               — proxy for YouTube search (videos + channels)
    channels/[channelId]/route.ts — proxy for a channel's latest videos
components/
  Hero.tsx          — landing headline + embedded search bar
  SearchBar.tsx     — controlled input, lives in hero or sticky header
  VideoGrid.tsx     — responsive grid with loading skeleton, error, empty states
  VideoCard.tsx     — thumbnail + title + channel, hover/selected states
  Player.tsx        — react-youtube wrapper in a 16:9 container
  ChannelRow.tsx    — horizontally scrollable row of channel cards
  ChannelCard.tsx   — circular avatar + channel name
  SectionLabel.tsx  — reusable Sora section heading
lib/
  youtube.ts        — parseSearchResults, parseChannelResults
types/
  index.ts          — YouTubeVideo, YouTubeChannel
```

---

## Phase 2 — Synced dual subtitles

### What Phase 2 involves

Below the player, show two lines of subtitles that stay in sync with playback:
- Line 1: the current Spanish lyric line
- Line 2: the English translation of that line

The subtitles should advance automatically as the video plays, highlight the active line, and be scrollable if the user wants to read ahead or behind.

### What needs to be built

- **Lyrics fetching** — source timestamped Spanish lyrics for the playing video (likely via a lyrics API or Gemini)
- **Translation** — translate each Spanish line to English using the Gemini Flash-Lite API
- **Subtitle sync engine** — poll `player.getCurrentTime()` on an interval, find the active line by timestamp, update display
- **SubtitlePanel component** — displays the Spanish + English line pairs; highlights the active cue; scrolls into view
- **State additions in page.tsx** — `lyrics`, `translations`, `activeCueIndex`

### New API routes

**`GET /api/lyrics?videoId=<id>`** — returns timestamped Spanish captions + English translations for a video.

```json
{
  "cues": [
    { "start": 12.4, "end": 15.1, "spanish": "Tu sonrisa ilumina el mundo", "english": "Your smile lights up the world" }
  ]
}
```

Error responses: `404 { "error": "no_captions" }` — video has no Spanish captions; `500 { "error": "fetch_failed" }`.

**`GET /api/define?word=<word>`** — returns a definition for a Spanish word via Gemini (Phase 3).

```json
{
  "word": "corazón",
  "pos": "noun",
  "definition": "Heart; the organ that pumps blood, or a term of affection.",
  "example": { "spanish": "Te llevo en mi corazón.", "english": "I carry you in my heart." }
}
```

### New types

```typescript
interface LyricCue {
  start: number;   // seconds
  end: number;     // seconds
  spanish: string;
  english: string;
}

interface WordDefinition {
  word: string;
  pos: string;     // "noun" | "verb" | "adjective" | etc.
  definition: string;
  example: { spanish: string; english: string };
}
```

### New components

| Component | Purpose |
|-----------|---------|
| `SubtitlePanel` | Scrolling panel of lyric cues; handles active state + auto-scroll |
| `LyricCue` | Single cue row: tappable Spanish words + English translation |
| `WordPopover` | Definition popover triggered by word tap (Phase 3) |

### State additions in `page.tsx`

```typescript
const [lyrics, setLyrics] = useState<LyricCue[]>([]);
const [lyricsLoading, setLyricsLoading] = useState(false);
const [lyricsError, setLyricsError] = useState<string | null>(null);
const [lyricsCache, setLyricsCache] = useState<Record<string, LyricCue[]>>({});
const playerRef = useRef<YouTubePlayer | null>(null);  // from react-youtube
```

### Why the Phase 1 architecture supports this

- `react-youtube` gives us a `player` ref with `getCurrentTime()` — this is why we chose it over a plain iframe
- The two-column desktop layout already has a natural space below the player for the subtitle panel
- The component structure is small and focused, so adding `SubtitlePanel` won't require refactoring existing components

### Acceptance criteria

**AC-1 — Lyrics fetch on video select**
- AC-1.1 When a video is selected, the app fetches timestamped Spanish captions from `/api/lyrics?videoId=<id>`.
- AC-1.2 The fetch begins immediately on video selection — it does not wait for the user to scroll to the subtitle panel.
- AC-1.3 If the video has no Spanish captions, the panel shows: "No lyrics available for this song."
- AC-1.4 If the fetch fails, the panel shows an error state without crashing the player.
- AC-1.5 Selecting a new video clears the previous lyrics and starts a fresh fetch.
- AC-1.6 If the video begins with an ad, subtitle sync does not start until the ad ends and the actual video content begins playing. The sync engine only activates when the IFrame Player API fires state `1` (playing) on the video itself.
- AC-1.7 If a caption track exists but has fewer than 3 cues, or every cue's text is shorter than 2 characters, it is treated as unavailable and the panel shows "No lyrics available for this song." This catches empty or junk auto-generated tracks.

**AC-2 — English translation**
- AC-2.1 Each Spanish lyric line is paired with an English translation; both are returned together from `/api/lyrics`.
- AC-2.2 Translations are fetched server-side — the Gemini API key is never in the browser.
- AC-2.3 If translation fails for a line, that line shows only Spanish (no broken UI).
- AC-2.4 The translation reads naturally — Gemini is prompted for musical/poetic context, not word-for-word literal output.

**AC-3 — Subtitle sync**
- AC-3.1 The app polls `player.getCurrentTime()` at a 250ms interval while a video is playing.
- AC-3.2 The active cue is the lyric line whose start ≤ current time < end (or next line's start).
- AC-3.3 The active cue is visually distinguished: full opacity, larger font, or amber accent on the Spanish line.
- AC-3.4 Inactive cues are dimmed (reduced opacity).
- AC-3.5 When the player is paused, polling stops. It resumes on play.
- AC-3.6 When the user seeks, the active cue updates within one poll cycle (≤250ms).
- AC-3.7 The polling interval is cleared when the component unmounts or a new video is selected.

**AC-4 — Auto-scroll**
- AC-4.1 The subtitle panel auto-scrolls so the active cue is always visible.
- AC-4.2 Scroll is smooth (`behavior: 'smooth'`).
- AC-4.3 If the user manually scrolls the panel, auto-scroll pauses for 3 seconds then resumes.
- AC-4.4 Auto-scroll moves only the panel — `window.scrollY` is unaffected.

**AC-5 — Tap-to-define (Phase 3, designed now)**
- AC-5.1 Each word in the Spanish line is individually tappable.
- AC-5.2 Tapping a word opens a popover: headword, part of speech, English definition, one example sentence.
- AC-5.3 The definition is fetched from `/api/define?word=<word>` via Gemini.
- AC-5.4 While loading, the popover shows a skeleton/spinner.
- AC-5.5 Tapping outside the popover (or another word) dismisses it.
- AC-5.6 Tapping a word does not pause the video.
- AC-5.7 Common function words ("y", "de", "el", "la", "a", "en") show a simplified result, not an error.

**AC-6 — Layout integration**
- AC-6.1 Mobile: the panel appears below the player, above the results grid; fixed height (~200px), internal scroll.
- AC-6.2 Desktop (≥1024px): after a video is selected, the layout is:
  - **Top-left 3/4**: YouTube player
  - **Top-right 1/4**: subtitle panel — same height as the player, internally scrollable
  - **Bottom, full width**: results grid — scrollable
  ```
  ┌──────────────────────────────────────────────────────────┐
  │  🎵 Kantaro                    [  search bar  ]          │ ← header
  ├────────────────────────────────────┬─────────────────────┤
  │                                    │                     │
  │   YouTube Player (16:9)     3/4   │   Subtitle Panel    │
  │                                    │   1/4 (scrollable)  │
  │                                    │                     │
  ├────────────────────────────────────┴─────────────────────┤
  │   Results Grid — full width, scrollable                  │
  │   [card] [card] [card] [card] [card] [card]              │
  └──────────────────────────────────────────────────────────┘
  ```
- AC-6.3 The panel is only rendered when a video is selected AND lyrics have loaded (or are loading).
- AC-6.4 The panel does not appear on the landing page.
- AC-6.5 The panel renders correctly from 320px to 1920px viewport width.

**AC-7 — Loading states**
- AC-7.1 While lyrics are loading, the panel shows a pulsing microphone icon (🎤) centered in the panel — not skeleton lines. The pulse uses a CSS `pulse` keyframe (opacity 1→0.3→1) matching the app's amber accent color.
- AC-7.2 The skeleton is replaced by lyrics once loaded.
- AC-7.3 The player is functional and playable while lyrics are still loading.

**AC-8 — Performance**
- AC-8.1 Polling does not cause visible frame drops or janky playback.
- AC-8.2 The Gemini translation call is made once per video — all lines batched in a single request.
- AC-8.3 Word definition fetches are debounced: rapid taps on multiple words fire only one request.
- AC-8.4 Lyrics and translations are cached client-side for the session — selecting the same video twice does not re-fetch.

---

### Test cases

#### Lyrics fetch

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-1 | Normal fetch | Select a popular Spanish video | Skeleton → Spanish + English lines appear |
| T-2 | No captions | Select a video with no Spanish captions | "No lyrics available for this song" |
| T-3 | Network error | Disable network, select a video | Error state in panel; player still works |
| T-4 | Switch videos | Play video A, then select video B | Panel clears immediately, shows skeleton for B, then B's lyrics |
| T-5 | Cache hit | Select A → play → select B → select A again | No second `/api/lyrics` request for A (verify in Network tab) |

#### Subtitle sync

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-6 | Active cue advances | Play a video with lyrics | Highlighted line advances with the song |
| T-7 | Pause | Play video, pause | Highlighted line stays on current cue; no further advancement |
| T-8 | Resume | Pause then play | Highlighting resumes from correct position |
| T-9 | Seek forward | Drag progress bar ahead 30s | Active cue jumps to the correct line within 250ms |
| T-10 | Seek backward | Drag progress bar to beginning | Active cue resets to the first line |
| T-11 | Video end | Let video play to completion | Last line stays highlighted; polling stops |
| T-12 | Instrumental intro | Play from start before lyrics begin | No cue highlighted until lyrics begin |

#### Auto-scroll

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-13 | Follows song | Play a long song | Panel scrolls smoothly; active line always visible |
| T-14 | Manual scroll interrupts | Scroll panel manually mid-song | Auto-scroll pauses; resumes after 3 seconds |
| T-15 | No page scroll | Confirm during auto-scroll | `window.scrollY` does not change |

#### Tap-to-define

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-16 | Content word | Tap "corazón" | Popover: "corazón — noun — heart. Example: …" |
| T-17 | Function word | Tap "de" | Simplified result ("preposition — of/from") |
| T-18 | Loading state | Tap a word | Spinner visible while Gemini fetches; definition replaces it |
| T-19 | Dismiss | Open popover, tap elsewhere | Popover closes |
| T-20 | Switch word | Popover open for A, tap word B | Popover transitions to B |
| T-21 | Video continues | Open a popover | Video audio keeps playing; active cue keeps updating |
| T-22 | API error | Simulate Gemini failure | "Definition unavailable" — no crash |

#### Layout

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-23 | Mobile | Viewport 375px; select a video | Panel below player, above results; fixed height, internal scroll |
| T-24 | Desktop | Viewport 1280px; select a video | Player top-left 3/4, subtitle panel top-right 1/4 (same height), results grid full-width below both |
| T-25 | No panel on landing | No video selected | Panel not in DOM |
| T-26 | Panel during loading | Select video before lyrics load | Skeleton shown; results grid still scrollable |
| T-27 | Narrow mobile | Viewport 320px | No overflow or clipping |

#### Performance & edge cases

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| T-28 | Rapid word taps | Tap 5 words quickly | One define request fires (debounce); no duplicates |
| T-29 | Cache hit | Select A → B → A again | No `/api/lyrics` request for A second time |
| T-30 | Unmount cleanup | Select video, navigate to landing | Polling interval cleared; no console warning about setState on unmounted component |
| T-31 | Long lyric line | Song with very long line | Text wraps inside panel; no overflow |
| T-32 | Non-Spanish video | Search English, play English video | Panel shows "No lyrics available for this song" |
| T-33 | Video with pre-roll ad | Select a video that begins with an ad | Subtitle panel stays blank/loading during the ad; sync only starts once the actual video content plays |
| T-34 | Junk caption track | Select a video whose auto-captions contain fewer than 3 cues or all cues are 1 character | Panel shows "No lyrics available for this song" rather than rendering broken/empty lines |

---

## Future phases

- Phase 3: Tap any Spanish word to see definition, part of speech, example sentence
- Phase 4: Vocabulary list, playback speed control, polish

### Phase 3 consideration — Lyrics source fallback chain

YouTube captions are the primary source (Phase 2), but coverage gaps exist (~40–80% depending on artist tier) and auto-generated captions on music are often inaccurate. When that becomes a problem, add fallbacks in this order:

| Priority | Source | Timestamps | Cost | Notes |
|---|---|---|---|---|
| 1 | **YouTube captions** (via `youtube-transcript`) | ✅ | Free | Primary — already planned for Phase 2 |
| 2 | **LRCLib** (`lrclib.net`) | ✅ | Free, no key | Open-source community LRC database. Best free fallback — minimal integration cost |
| 3 | **Musixmatch API** | ✅ Synced LRC | Paid for commercial | Industry standard; used by Spotify, Apple Music, Amazon. Best coverage for Latin music |
| 4 | **Genius API → Gemini re-align** | ❌ (text only) | Genius free; Gemini already in stack | Last resort — send plain lyrics + video duration to Gemini and ask it to estimate timestamps |

Implementation when needed: try each source in order, stop at the first that returns a usable result (≥3 cues, cue text ≥2 chars per AC-1.7).

## APIs

- **YouTube IFrame Player API** — for embedding and controlling video playback (no API key needed)
- **YouTube Data API v3** — for search functionality (requires API key, free tier: 10,000 quota units/day)
- **Gemini Flash-Lite API** — for translation and word definitions in Phase 2+ (not needed yet)

## Design direction

This app should NOT look like generic AI-generated UI. Go for a distinctive, intentional aesthetic:

- **Vibe**: Late-night music listening session. Warm, immersive, slightly editorial.
- **Color palette**: Dark background (#0a0a0a or similar), warm amber/gold accent (#f59e0b), muted text on dark surfaces. Avoid pure white text — use off-white (#e5e5e5).
- **Typography**: Use Google Fonts. Pick something with character — not Inter, Roboto, or Arial. Consider pairings like Outfit (headings) + DM Sans (body), or Sora + Nunito. Claude should suggest and justify the font choice.
- **Cards/Components**: Subtle border radius, soft shadows or glows on hover, no harsh borders. Hover states should feel alive (gentle scale, glow, or color shift).
- **Layout**: Clean and spacious. On mobile, player sticks to top, results scroll below. On desktop, consider a two-column layout.
- **Motion**: Subtle fade-ins on search results, smooth transitions between states. Nothing flashy — just enough to feel polished.

## Code style

- Clean, readable code with comments explaining *why*, not *what*
- Small, focused components — one responsibility per component
- Use environment variables for API keys (never hardcode)
- Semantic HTML where possible
- Accessibility basics: alt text, keyboard navigation, sufficient contrast

## What I'm here to learn

I'm using Claude Code for the first time. I want to understand *why* decisions are made, not just see the output. If I ask you to plan something, explain the tradeoffs. If you pick an approach, tell me why. Teach me as we build.
