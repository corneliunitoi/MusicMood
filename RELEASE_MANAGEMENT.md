# 📦 MusicMood — Release Management & Versioning Protocol

This document defines the release management protocol, versioning standard, and historical changelog for the **MusicMood** project.

---

## 🏷️ Versioning Standard

MusicMood strictly adheres to the following tiering convention:

| Tier | Format | Purpose | Examples |
|---|---|---|---|
| **Bugfixes & Hotfixes** | `0.6.0a`, `0.6.0b`, `0.6.0c`... | Fast bugfixes, emergency hotfixes, OAuth adjustments, and minor styling patches. | `v0.6.0b` (admin stats gating, playlist scope authorization). |
| **Small Feature Additions** | `0.6.1`, `0.6.2`, `0.6.3`... | Incremental small features, UI enhancements, and configuration options. | `v0.6.1` (custom default subgenres for the Core 6 moods, 1-click pin). |
| **Big Feature Additions** | `0.7.0`, `0.8.0`, `0.9.0`... | Major functional systems, substantial new capabilities, and deep service integrations. | `v0.7.0` (On-Demand Artist Library & Lookup, "Add Your Own Artist" with 10-track discography harvest). |
| **Major Releases** | `1.0.0`, `2.0.0`... | Complete platform milestones, production general availability, and multi-user scaling. | `v1.0.0` (Public GA Launch). |

### Git Tag Rules:
* All git tags **must** be prefixed with a lowercase `v` in 3-segment format (e.g., `v0.6.0b`, `v0.6.1`, `v0.7.0`).
* Never create bare numeric tags (e.g., `0.60a`) or mixed casing (`V0.6.0`).

---

## 🏷️ How Release Notes Work on Git & GitHub

When you view tags or releases, MusicMood supports both local Git annotations and rich GitHub Releases:

1. **In Git (Annotated Tag Message):**
   * Running `npm run tag-release vX.Y.Za` extracts the exact markdown release notes from this document and writes them directly into the Git tag's annotation object.
   * Anyone running `git show vX.Y.Za` in their terminal or Git GUI sees the full release notes directly attached to the tag.
2. **On GitHub (Rich Markdown Releases):**
   * A dedicated GitHub Actions workflow (`.github/workflows/release.yml`) automatically triggers whenever a `v*` tag is pushed to `origin`.
   * The workflow parses `RELEASE_MANAGEMENT.md`, extracts the corresponding section, and automatically publishes an official GitHub Release at `https://github.com/corneliunitoi/MusicMood/releases`.
   * When users click on the release tag on GitHub, GitHub renders the formatted markdown notes, headers, badges, and download archives.
3. **Automated Backfill Engine for Historical Tags:**
   * Running `npm run backfill-tags` iterates over all historical releases since `v0.5.0`, extracts their respective changelogs from this document, and annotates each Git tag pointing directly to its original historical commit.
   * The GitHub Actions workflow (`.github/workflows/backfill-releases.yml`) automatically synchronizes and publishes official GitHub Releases for all 23 historical versions since `v0.5.0` on GitHub with formatted Markdown notes.

---

## 📋 Release Checklist

Whenever a release or milestone patch is prepared:

1. [ ] **Verify Production Build:** Run `npm run build` and ensure exit code 0 with zero bundle/Vite errors.
2. [ ] **Bump Version in `package.json`:** Update `"version": "X.Y.Za"`.
3. [ ] **Update `README.md` Badge:** Update the version badge URL in `README.md`.
4. [ ] **Log in `RELEASE_MANAGEMENT.md`:** Document the changes under the Changelog section below.
5. [ ] **Git Commit:** Commit changes with message `chore(release): bump version to vX.Y.Za`.
6. [ ] **Create Annotated Git Tag with Release Notes:** Run `npm run tag-release vX.Y.Za` (or `git tag -a vX.Y.Za -f -F <notes>`).
7. [ ] **Push to Remote:** Push commit and tags: `git push origin main` and `git push origin vX.Y.Za --force`. GitHub Actions will automatically publish the GitHub Release.

---

> [!IMPORTANT]
> **VERSION CEILING LOCK (v0.8.x Stability & Hardening Period):**
> Do **NOT** bump the project version past `0.8.x` (e.g., do not increment to `0.9.0` or `1.0.0`) until explicitly authorized by the project owner. The entire `v0.8.x` release series is strictly reserved for **stability, reliability, performance hardening, and bug fixes**. Any incremental updates must follow patch/minor notation within `0.8.x` (e.g. `0.8.0a`, `0.8.0b`, `0.8.1`, etc.).

---

## 📜 Release Changelog

### `v0.8.4` — 2026-11-13
* **Adaptive Buffering Engine, Zero-Video Audio Lock, Staged Artist Request Hygiene & Fixed Geometry:**
  * **⏳ Adaptive Buffering Engine with User Control (`Player.jsx`):**
    * Differentiated `BUFFERING` (`pState === 3`) from dead streams: rather than violently cutting off audio at 14s, the watchdog grants an extended grace window (up to 30s total) for slower connections.
    * Gentle Auto-Nudge (Re-kick at 10s): silently issues `player.playVideo()` to kickstart YouTube's internal DASH/HLS pipeline without restarting playback.
    * Polite Buffering UI: displays an interactive inline banner (`⏳ Slow connection: buffering audio stream... [Skip Now ⏭️]`) allowing listeners to wait or skip instantly.
    * Non-Destructive Watchdog: eliminated database deletions on network timeouts, preserving valid songs.
    * Bandwidth Optimization: added `suggestedQuality: 'small'` (`144p`/`tiny`) to `loadVideoById`, reducing video chunk payloads by 95%+ and directing bandwidth strictly to audio streams.
  * **🔇 Zero-Video Pure Audio Engine Lock (`Player.jsx` / `index.css`):**
    * Eliminated accidental 240x240 video window leak by configuring `YT.Player` dimensions to `1px × 1px` and enforcing strict off-screen CSS locks (`top: -9999px !important; left: -9999px !important; opacity: 0 !important; pointer-events: none !important;`).
  * **🏷️ Clean Player Geometry & Library Artist Navigation (`Player.jsx` / `Dashboard.jsx` / `ArtistsExplorer.jsx`):**
    * Song title unlinked from YouTube (YouTube opens exclusively from the dedicated button). Hovering reveals full track and artist title via tooltip.
    * Clean artist display with single-line truncation (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`). Prevents multi-line wrapping and keeps player window height strictly stable.
    * Clicking the artist name opens their discography modal directly in the library without reloading or losing playback state.
  * **🗃️ Staged Artist Request Hygiene & Catalog Deduplication (`supabaseService.js` / `ArtistsExplorer.jsx`):**
    * Filtered `fetchArtistSuggestions` to exclude `is_requested: true`, `request_count > 0`, and statuses `['requested', 'inflated', 'rejected']`.
    * Added `fetchRequestedArtistIdentifiers()` to hydrate client cache on mount with all requested artists directly from Supabase.
    * Excluded verified catalog artists from "Potential Matches" candidates to prevent duplicate suggestions.
  * **🩹 Catalog Healing: "Years" ➔ "10 Years":**
    * Reassigned 69 tracks from phantom artist `"Years"` to `"10 Years"`, healed genre from `pop` to `metal` (`[alt_rock, hard_rock]`), and registered canonical lock in `genreNormalizer.js`.
  * **💿 Milestone Lossless CUE Ingestion:**
    * Ingested +2,000 lossless CUE tracks into `public.tracks` (crossing **91,826+** total playable tracks), reducing remaining unmapped archive tracks to only ~2,687.

### `v0.8.3` — 2026-11-13
* **In-App Master Volume Slider, Web Media Session API, Player QoL Improvements & Dynamic Tag Sanitization:**
  * **🔊 In-App Master Volume Slider & Mute Toggle (`Player.jsx`):**
    * Added a dedicated, glassmorphic Volume slider (`100px`, cyan `#06b6d4`) alongside a shortened Energy slider (`110px`, purple `#a855f7`) in the playback steering panel.
    * Integrated persistent mute toggle (`🔇` / `🔊`) with cross-session `localStorage` persistence (`musicmood_volume`, `musicmood_muted`).
    * Replaced all hardcoded `setVolume(100)` occurrences with synchronized audio helper `syncPlayerAudio()`.
  * **📱 Web Media Session API Integration (`Player.jsx`):**
    * Connected browser `navigator.mediaSession` with rich track metadata, high-resolution YouTube artwork, and playback state (`playing`, `paused`, `none`).
    * Added hardware / lock screen / notification shade transport action handlers (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`).
    * Synchronized Media Session position state (`duration`, `playbackRate`, `position`).
  * **🎧 Player Quality-of-Life & Navigation Hardening (`Player.jsx`):**
    * **Full Song Title Tooltip:** Added native browser tooltip (`title={fullSongTitle}`) to track titles in the player to view lengthy track names without truncation.
    * **Decoupled Internal Navigation:** Clicking artist name navigates in-app to the artist's catalog in `ArtistsExplorer`, reserving the YouTube pill button exclusively for opening external YouTube videos.
    * **Airy Player Layout Integrity:** Maintained original single-row player layout and eliminated accidental scrubber duplication.
  * **🛡️ Toxic Secondary Tag Sanitization & Normalizer Centralization (`genreNormalizer.js` / `reclassifyCatalog.js` / `resolveVideoIds.js`):**
    * Centralized `sanitizeSecondaryTags()` in `genreNormalizer.js` with cross-genre contamination guard (`TOXIC_TAGS_MAP`).
    * Prevented classical, jazz, and blues tracks from inheriting conflicting secondary tags (e.g. rock, hip-hop, pop) during background CUE and metadata ingestion.
  * **🧭 Roadmap Item #18 Added (`ROADMAP.md`):**
    * Logged Universal Sonic Profiler redesign proposal to transform Onboarding Step 2 into an intuitive harmonic bridge linking Step 1's Sound Polygon to Step 3's 6 Core Mood Homes.

### `v0.8.2` — 2026-11-13
* **Feature Freeze Milestone, Strict Genre Anchoring, Playback Fluctuation Elimination & Lossless CUE Pipeline:**
  * **Feature Freeze & Stabilization Focus:**
    * Concluded all major feature expansion cycles across the platform; locked roadmap strictly to stability, resilience, and bug fixing.
  * **Strict Genre Family Containment & Invariant Locking (`sessionStateMachine.js` / `Player.jsx`):**
    * **Zero Drift on Next / Skip:** Track candidate sourcing in `pullCatalogCandidate` and `sourceEmergencyTrack` is strictly locked to the user's active genre family (`sameFamilyGenres` sharing the exact same `group`). Hitting Next never wanders into unrelated genres.
    * **Surprise Me Exclusivity:** Harmonic graph hops across genre families are now strictly reserved for explicit user actions ("Surprise Me", manual dropdown changes, or mood shifts). Normal playback and skips stay firmly anchored to the chosen genre.
    * **Auto-Replay Resilience:** If a genre's local catalog is temporarily exhausted, the engine relaxes exclusion windows to replay genuine tracks in that genre family rather than falling back to random or mismatched music.
    * **Eliminated Unfiltered Fallback:** Removed blind `select('*')` emergency fallback from `sourceEmergencyTrack`, ensuring unrelated genres can never be pulled into the active station.
  * **Elimination of Playback Fluctuation on Next (`Player.jsx`):**
    * Added `activeVideoIdRef` idempotency guard in `playTrackImmediately`, rejecting duplicate rapid load calls for the same video ID.
    * Gated `sessionEngine.subscribe` track loading with `!isTransitioningRef.current`, resolving the race condition between `commitTrack()` notifications and `loadNextTrack()` returns that previously caused double video loading, stuttering, and repeated buffering.
  * **Non-Disruptive Genre Review Flagging (`Player.jsx` / `supabaseService.js`):**
    * Reporting a mislabeled genre (`🏷️`) no longer abruptly stops playback or forces a skip; the song continues playing uninterrupted so listeners can enjoy it and skip manually only if and when desired.
    * Added instant visual feedback (`✓` with a green highlight) and duplicate submission prevention.
    * Automatically purges upcoming tracks by the flagged misclassified artist from the session buffer queue.
  * **Local Lossless CUE/APE Album Explosion & Online Stream Ingestion (`scanLocalAlbums.js` / `cueParser.js` / `resolveVideoIds.js`):**
    * **Stage 1 (Offline Explosion):** Scanned local lossless network library (`\\192.168.0.2\e$\music\Flac muzic`), parsed 1,960 `.cue` sheets, exploded 1,826 complete albums (23,634 tracks total), and staged 19,388 unique deduplicated tracks in `public.local_metadata` with manifest in `public/exploded_albums_manifest.json`.
    * **Stage 2 (Online Ingestion):** Added `--cue-only` and `--limit` flags to `scripts/resolveVideoIds.js`, with verified InnerTube mapping (~450ms/track) into `public.tracks` and `public.artists`.
    * **Automated Hourly Ingestion:** Integrated continuous CUE track ingestion directly into `.github/workflows/reconcile-flags.yml` for automated background catalog expansion.
  * **Audition Experience Improvements (`ArtistsExplorer.jsx` / `Dashboard.jsx`):**
    * Auditioning candidate demo songs via `▶ Try` keeps the Explorer panel open and preserves scroll position.
    * Requesting an artist instantly dismisses them from the view with visual confirmation and dynamically fetches new candidate replacements.
    * Added reject button (`✕`) allowing listeners to permanently dismiss unwanted candidates.

### `v0.8.1a` — 2026-11-13
* **Artist Catalog Deduplication & Reconciliation, "Try Before You Request" Candidate Demo Player & Nightly Sync:**
  * **Catalog Deduplication & Fuzzy Clustering (`ArtistsExplorer.jsx` / `auditArtistDuplicates.js` / `mergeDuplicateArtists.js`):**
    * Identified and resolved 198 duplicate artist clusters caused by punctuation differences, casing, and unicode hyphens (e.g., *Jean-Michel Jarre* vs *Jean Michel Jarre*, *Pink Floyd* vs *PINK FLOYD*, *Dead Can Dance* vs *DEAD CAN DANCE*, *Björk* vs *Bjork*).
    * Implemented frontend fuzzy clustering with linguistic quality scoring in `ArtistsExplorer.jsx`: collapses duplicate artist rows into a single canonical card, picks the cleanest Title Case name with proper accents, and combines track counts.
    * Unified 6,685 tracks in `public.tracks` to canonical artist IDs and names.
    * Added normalized fuzzy search: searching without hyphens or diacritics (e.g. `jean michel jarre`) immediately matches the canonical entry.
    * Cleaned CJK mojibake tag corruptions (`Phil Collins潶` $\to$ `Phil Collins`, `Duran Duran攀` $\to$ `Duran Duran`).
  * **"Try Before You Request" Candidate Demo Player (`ArtistsExplorer.jsx` / `artist_suggestions` / `populateStagedDemos.js`):**
    * Added `demo_youtube_id` and `demo_track_title` columns to `public.artist_suggestions`.
    * Added **`▶ Try`** button alongside **`+ Request`** on each Potential Match card: allows listeners to demo the artist's signature track with 0ms delay before deciding to request full catalog ingestion.
    * Plays through the standard MusicMood YouTube player bar via `onPlayTrack()`, preserving audio controls and visualizer state.
    * Created `scripts/populateStagedDemos.js` to automatically resolve signature tracks for staged candidates.
  * **Nightly Automation Updates (`.github/workflows/reconcile-flags.yml`):**
    * Integrated automated candidate demo track population into the nightly 03:00 UTC maintenance run.
    * Maintained the 250 artist/night open-license profile picture auto-population queue.

### `v0.8.0a` — 2026-11-13
* **On-Demand Player Subgenre Locking, 100% Staged Genre Normalization, 2-Tier Open-License Artist Avatars & Nightly Pipeline Automation:**
  * **On-Demand Player Subgenre Locking (`sessionStateMachine.js` / `Player.jsx` / `Dashboard.jsx`):**
    * Added `sessionEngine.playOnDemand(track)`: when a track is manually clicked in Artists Explorer, Favorites, or Playlists, it normalizes the track's subgenre via `normalizeGenre()`, anchors `this.state.activeGenre` to that specific node, and flushes the stale buffered queue so the player firmly stays on that requested subgenre.
    * Added instant local synchronization in `Player.jsx` ensuring the active genre dropdown updates with 0ms lag.
    * Preserved custom playlist queue support when launching Artist Radio.
  * **Elimination of "Other" Genre Across Discovery & Staging (`scanArtistCandidates.js` / `ArtistsExplorer.jsx` / `healStagedGenres.js`):**
    * Healed 100% of the 1,080 staged artist suggestions in `public.artist_suggestions`, replacing all unassigned and "other" categories with authentic parent genres.
    * Updated KEXP live scanner to resolve top Last.fm artist tags and default un-tagged acts to `alt_rock` instead of `null`.
    * Updated Potential Matches UI in `ArtistsExplorer.jsx` to map candidates through `getParentGenre()`, permanently removing the "Other" badge.
  * **2-Tier Open-License Artist Profile Pictures (`populateArtistAvatars.js` / `avatarService.js`):**
    * Implemented strict legal hierarchy: Tier 1 Wikipedia / Wikimedia Commons (Creative Commons CC-BY / Public Domain), Tier 2 Deezer Promotional Press API (for acts without Wikipedia biographies), and Tier 3 Procedural Gradient Initials.
    * Populated 950+ catalog artists directly in Supabase (`public.artists.avatar_url`).
    * Implemented smart artist name decomposition (cleaning inverted comma names, corrupted diacritics, and collaborative artist pairs) ensuring all artists with $\ge 20$ tracks have high-resolution profile pictures.
    * Added client-side real-time on-demand avatar resolution in `avatarService.js`: viewing or clicking any blank artist in the UI resolves and renders their picture on the fly and saves it to Supabase.
  * **Automated Nightly Maintenance Workflow (`.github/workflows/reconcile-flags.yml`):**
    * Added automated nightly staged genre healing and dynamic avatar population (250 artists/night) running at 03:00 UTC.
    * Supported on-demand dispatch with configurable `avatar_limit` in the GitHub Actions UI.

### `v0.8.0` — 2026-11-13
* **Artist Staging Architecture, Dynamic Library Balancer, Hourly Discovery Engine & UI Staging Explorer:**
  * **Artist Candidate Staging Area (`public.artist_suggestions`):**
    * Decoupled artist discovery from track resolution, allowing high-throughput harvesting without audio stream / InnerTube overhead.
    * Added anti-AI heuristics, first-release-year gating, confidence scoring, and database-level unique constraint on `lower(name)`.
  * **Dynamic Multi-Genre Library Balancer (`scripts/scanArtistCandidates.js`):**
    * Dynamically balances the catalog across 8 core pillars (Blues, Country/Americana, Folk & Acoustic, Avant-Garde, Reggae & World, R&B/Soul, Ambient/Chill, Jazz & Fusion) plus KEXP 90.3 FM eclectic live radio curation.
    * Pre-indexes 13,000+ catalog artists with diacritic, punctuation, and symbol normalization (`normalizeArtistKey`) guaranteeing zero duplicate artists.
  * **Hourly GitHub Actions Pipeline (`.github/workflows/scan-artists-hourly.yml`):**
    * Automated top-of-the-hour discovery runs staging 500 balanced candidates with live markdown summary tables rendered directly to `$GITHUB_STEP_SUMMARY`.
  * **Artists Explorer — "Potential Matches (In Staging)" Section (`ArtistsExplorer.jsx` / `supabaseService.js`):**
    * Dual live search across verified catalog artists and staged candidates.
    * Filter candidates by status (`Approved`, `Under Review`), inspect confidence scores and genre pillars.
    * Added "+ Request Artist" button for listener-driven ingestion prioritization.
  * **Responsive UI Layout:**
    * Wrapped all 16 category filter pills and staging filters across rows to fit all screen sizes with zero horizontal scrolling.

### `v0.7.9` — 2026-11-12
* **Dynamic Active Genre Steering & Locking, Catalog Scaling Past 11,200 Artists & Comprehensive Architecture Audit:**
  * **Dynamic Active Genre Steering & Locking (`sessionStateMachine.js` / `Player.jsx`):**
    * Centralized active node synchronization inside `sessionEngine.commitTrack(track)`: manually selecting any track from the Artist Explorer or Favorites now immediately jumps and locks the Taste Graph's active node to that track's specific genre.
    * Preserves the Fixed Genre Policy so playback stays anchored in the chosen genre continuously across subsequent songs until an explicit mood change or "Surprise Me" trigger.
    * Added immediate local synchronization in `Player.jsx` ensuring the **🛡️ Active Node** dropdown header updates with zero lag.
  * **Dynamic Artist Explorer Pagination (`ArtistsExplorer.jsx`):**
    * Replaced the hardcoded 11-page query ceiling with dynamic count queries (`count: 'exact', head: true`), allowing the Artist Explorer to seamlessly fetch and render beyond 11,000 artists without artificial clipping.
  * **Last.fm Library Harvest Expansion (Batches 2 & 3):**
    * Ingested +200 iconic artists and +1,996 verified studio tracks directly into Supabase from `@octakhan888`'s Last.fm library (covering missing underground bands across prog metal, post-rock, darksynth, jazz fusion, and electronic).
    * Total verified catalog milestone reached: **11,200 artists** and **61,070 tracks**.
  * **Comprehensive Pre-Sale Code & Commercial Architecture Audit:**
    * Completed thorough code review artifact (`MUSICMOOD_COMPREHENSIVE_CODE_AUDIT.md`) detailing security (guest credential isolation, upvote RLS), component architecture (decomposing `Player.jsx`), and enterprise valuation strategies (proprietary Taste Graph IP positioning & audio provider abstraction).

### `v0.7.8` — 2026-11-12
* **Last.fm Public API Integration, Automated 100-Artist Catalog Harvest, Elimination of Non-Deterministic Chunk Duplication & In-App Latest Added Category:**
  * **Last.fm Official REST API Scraper & Catalog Analyzer (`scripts/scrapeLastFmArtists.js`):**
    * Integrated with the official Last.fm AudioScrobbler REST API (`library.getartists` & `user.gettopartists`) with authenticated API key support.
    * Bypasses Cloudflare anti-bot challenges and paginates through entire user scrobble profiles (e.g. 3,386+ artists across 34 pages).
    * Performs live cross-referencing against MusicMood's 10,800+ catalog artists in Supabase, separating existing catalog anchors from unrepresented underground bands.
  * **Automated Discography Ingestion & Zero-Quota Studio Resolver (`scripts/harvestLastFmArtists.js`):**
    * Built autonomous harvest pipeline mapping artist tags to our canonical 115-taxonomy nodes with secondary tag support.
    * Resolves top 10 iconic tracks per artist to verified studio audio streams on YouTube Music via the InnerTube `WEB_REMIX` zero-quota API.
    * Ingested 100 new iconic & underground artists and 1,000 verified tracks directly into `public.artists` and `public.tracks` (featuring Gojira, Meshuggah, Deafheaven, GoGo Penguin, Nala Sinephro, Caligula's Horse, Machine Head, Brutus, Au5, and Romanian post-rock pioneers *Am fost la munte și mi-a plăcut*).
  * **Elimination of Non-Deterministic Chunk Duplication in Artist Explorer (`ArtistsExplorer.jsx`):**
    * Resolved non-deterministic sorting collisions across the 11 parallel pagination chunks by enforcing deterministic secondary ordering: `.order('track_count', { ascending: false }).order('id', { ascending: true })`.
    * Implemented client-side `uniqueMap` deduplication by canonical artist name and UUID, permanently eliminating 760 duplicate artist cards from the explorer view.
  * **In-App 1-Click Catalog Sync (`ArtistsExplorer.jsx`):**
    * Added an in-place `🔄 Sync` action button directly in the Artist Explorer header.
    * Invalidates the module-level in-memory cache and re-queries fresh catalog additions from Supabase on demand without requiring browser page reloads.
  * **New "✨ Latest Added" Category (`ArtistsExplorer.jsx`):**
    * Added a dedicated parent genre filter pill showcasing the **50 most recently ingested catalog artists** (sorted `created_at DESC`) with instant search.
  * **Roadmap & Feedback Synchronization (`ROADMAP.md`):**
    * Synced live user feedback into roadmap items: Web Media Session API lock screen/notification playback controls, authenticated user upvote isolation (`user_upvotes`), in-player artist navigation, and cross-device preferences sync.

### `v0.7.7` — 2026-11-09
* **Catalog Artist Explorer, Defense-in-Depth YouTube Playback Hardening, Autonomous Reconciliation Nightly Cron & Author Attribution:**
  * **Top-Level Catalog Artist Explorer (`ArtistsExplorer.jsx` / `Dashboard.jsx`):**
    * Added dedicated `👤 Artists` header navigation pill alongside Calibrate, Playlists, and Favorites with mutual exclusivity.
    * Split cleanly across all **14 high-level parent genre families** (Rock, Metal, Electronic, Pop, Hip-Hop, R&B/Soul, Jazz, Blues, Classical, Folk, Country, World/Reggae, Ambient, Avant-Garde).
    * Space-efficient **compact 2-row layout** (`maxHeight: 286px`) with custom hidden horizontal scrollbars on genre pills and smooth internal vertical scrolling.
    * Fast parallel retrieval (< 400ms) populating and caching all **10,849 catalog artists** with instant search across the entire library.
    * Smooth infinite scrolling dynamically rendering cards in batches to maintain 60fps performance without DOM bloat.
    * High-resolution artist portraits via Deezer and Wikipedia Summary APIs with initials monogram fallback on a glowing genre-accent border.
    * Interactive track inspection modal listing all verified YouTube catalog tracks for each artist with individual "▶ Play" and "▶ Play Artist Radio" queueing.
  * **Player Playback & ID Resolution Hardening (`Player.jsx` / `ArtistsExplorer.jsx`):**
    * Normalized track objects to pass the 11-character `youtube_video_id` as the player's primary `id` and the Supabase UUID as `dbId`.
    * Added defensive ID resolution in `Player.jsx` (`targetVideoId`) ensuring YouTube's `loadVideoById` always receives a valid 11-character video ID, never a UUID.
    * Eliminated the watchdog buffering deadlock (`finalState === 3`) so stalled or malformed streams never freeze the player in a spinning buffer state.
    * "Play Artist Radio" now actively populates `sessionEngine.queue` with the rest of the artist's discography.
  * **Autonomous Catalog Disambiguation & Nightly GitHub Actions Cron (`reclassifyCatalog.js` / `reconcile-flags.yml`):**
    * Disambiguated catalog flags, pruned toxic cross-genre secondary tags, and resolved bloated rock mappings.
    * Created nightly 03:00 AM UTC GitHub Actions workflow (`reconcile-flags.yml`) and upgraded runner to Node 22.
    * Added Phase 5 (`syncArtistGenres`) syncing `public.artists.primary_genre_id` with track consensus (fixed Handel to baroque/classical and synchronized 88 drifted artists).
  * **In-App About Modal & Author Attribution (`AboutModal.jsx` / `Dashboard.jsx`):**
    * Added an `ℹ️ About` action button in the header top-right.
    * Displays application version `v0.7.7`, author and creator attribution (Corneliu Nițoi / `@corneliunitoi`), contact email (`corneliunitoi@gmail.com`) with 1-click copy, and repository links.
  * **Roadmap & Taxonomy Alignment (`ROADMAP.md`):**
    * Documented Item #10 for rebalancing `synth_pop` into `Electronic` and reconciling artist track plurality (e.g. Depeche Mode).

### `v0.7.6` — 2026-11-09
* **Misclassification Flagging System, Real-Time Energy Slider Steering & Active Vocal Preferences:**
  * **In-Player Misclassification Flagging & Staging Database (`Player.jsx` / `supabaseService.js`):**
    * Added a 1-click **🏷️ Report Misclassified Genre** button in the player controls beside Upvote, Favorite, and Dislike.
    * Safely skips the track immediately from the active session *without* downvoting the artist's affinity score or penalizing the taste model.
    * Created dedicated `public.track_genre_flags` table in Supabase with full RLS and unique constraint `(track_id, user_id)` to prevent report spam.
  * **Automated Multi-Source Healing Script (`scripts/resolveFlaggedTracks.js`):**
    * Built batch reconciliation runner (`npm run resolve:flags` / `npm run resolve:flags:apply`).
    * Cross-verifies flagged tracks against Apple / iTunes Search API (5-match frequency consensus), MusicBrainz community tags, and Wikipedia extracts.
    * Automatically detects and heals inverted artist/title metadata (e.g. *Carlos Montoya - Malagueña* repaired and reclassified from `rock`/`ska` to canonical `flamenco`).
  * **Real-Time Energy Slider Steering Engine (`sessionStateMachine.js`):**
    * Connected the player's `⚡ Energy` slider (0% to 100%) directly into catalog candidate selection and harmonic transitions.
    * Implemented Gaussian proximity decay weighting: tracks whose energy closely matches the slider are chosen with high probability, giving distinct acoustic contrast between low and high energy settings.
    * Debounced buffer invalidation on slider change to repopulate the queue immediately with tracks fitting the new energy profile.
    * Wired active slider energy into the predictive engine (`predictBestGenreForMood`) and `surpriseMe()` subgenre scorer.
  * **Active Vocal Preference Steering (`sessionStateMachine.js`):**
    * **`Instrumental Only`:** Strictly checks the database `is_instrumental` flag and genre vocal profiles, filtering out vocal titles and adding `'instrumental'` to YouTube queries.
    * **`Vocals`:** Actively rejects purely instrumental tracks and soundscape/drone genres, filtering out titles marked `instrumental`, `karaoke`, or `backing track`.
    * **`Any`:** Default unconstrained playback.
  * **Strategic Roadmap Update (`ROADMAP.md`):**
    * Completed Milestone v0.7.6.
    * Added Item #6: **In-App Master Volume Slider & Mute Control** based on live user feedback.

### `v0.7.5` — 2026-11-08
* **Row-Level Security Hardening, Upvote System, Discography Inflation Pipeline & Player Buffer Grace:**
  * **Player Buffer Grace & Watchdog Hardening (`Player.jsx`):**
    * Fixed premature track skipping on slow or high-res streams when hitting "Next": increased the silence/stalled watchdog timer from 6,000ms to 14,000ms.
    * Added active buffering state inspection: if the YouTube IFrame player is in state `3` (`BUFFERING`) at the 14-second mark, the engine grants extra grace time instead of purging or skipping the track.
  * **Row-Level Security (RLS) & Supabase Security Advisor Hardening (`schema_v2.sql` / `verify_rls.js`):**
    * Enabled RLS on `public.user_favorites` with strict multi-tenant isolation (`(select auth.uid()) = user_id`) for authenticated listeners, completely blocking unauthorized public/anon inspection.
    * Enabled RLS on `public.local_metadata`: granted public `SELECT`, `INSERT`, and `UPDATE` for client JIT and ingestion, while permanently removing public `DELETE` to protect the 54,100+ track archive.
    * Removed legacy `"Allow public delete on local_metadata"`.
    * Cleared all `ERROR` lints in the Supabase Security Advisor down to 0 findings.
    * Added test suite `scripts/verify_rls.js` validating RLS isolation across both SQL and client HTTP levels.
  * **Interactive Upvote Button & Real-Time Popularity Architecture (`Player.jsx` / `supabaseService.js`):**
    * Added an emerald **👍 Upvote** button placed directly to the left of the ❤️ Favorite button in the player control bar.
    * Added `upvotes` column on both `public.tracks` and `public.artists`.
    * Added `affinity_score` and `last_inflated_at` on `public.artists`.
    * Created real-time PostgreSQL triggers (`trg_artist_affinity_favorites` and `trg_artist_affinity_history`) and `public.upvote_track` RPC: atomically updates artist and track upvotes and composite affinity scores on likes, completions, and skips.
    * Migrated all 80 saved favorites from `public.user_favorites`, raising the baseline popularity of favorited artists across the database.
  * **Artist Discography Inflation Pipeline (`scripts/inflateArtists.js`):**
    * Built autonomous discography inflation engine (`npm run inflate:artists` / `npm run inflate:artists:dry`).
    * Discovers an artist's canonical top hit songs via iTunes Search API and resolves official YouTube Music audio in ~300ms via InnerTube (zero Google API quota).
    * Enforces a strict 10-track ceiling per artist to eliminate the "YouTube echo chamber effect" while turning solitary artists into cohesive musical destinations.
    * Tested and inflated top priority artists (including *God Is My Co-Pilot*, *Lewis Taylor*, *Gal Costa*, *Пустоцвет*, *Freedom Call*, *Alex Bueno*, *Koko Taylor*, *Battle Beast*, *Manntra*, *Shortwire*) adding +72 canonical tracks.
  * **Strategic Roadmap Update (`ROADMAP.md`):**
    * Added Item #7: **Sonic Analytics & Community Insights Dashboard** featuring Most Popular Songs, Top Artists, Most Active Listener Podium (`Corneliu / @me :D`), and Mood/Genre Heatmaps.

### `v0.7.4` — 2026-11-07
* **User Feedback System, Share Ingestion & 50,000+ Track Catalog Milestone:**
  * **Interactive User Feedback Modal & Data Pipeline (`FeedbackModal.jsx` / `supabaseService.js`):**
    * Created dedicated `FeedbackModal` component with clean glassmorphic design matching the MusicMood design system.
    * Captures user/guest name, multi-line comment/suggestions, and auto-associates user context (authenticated user ID vs anonymous guest session).
    * Created `public.feedback` database table in Supabase with Row Level Security (RLS) enabled: public `INSERT` permitted for all listeners, restricted `SELECT` for authenticated admins.
    * Added `submitUserFeedback` service method in `supabaseService.js` with client-side validation, loading spinner, and success feedback.
    * Added high-affordance `💬 Feedback` button in the top-right header next to Sign Out, and an accessible feedback link on the initial sign-in screen in `App.jsx`.
  * **Local Music Library Expansion & SMB Share Scanner (`scanLibrary.js`):**
    * Added dedicated scanner shortcuts `npm run scan-library:muzike` and `npm run scan-library:muzike:random` pointing at network music shares (`\\192.168.0.2\e$\Muzike`).
    * Added taxonomy detection for progressive and experimental folder hierarchies (`Avant`, `Prog`, `Progmassiv`, `Post`, `Symho`, `Jazz`).
    * Synced 16,276 tracks into `public.local_metadata`, boosting personal archive size to over 54,100 tracks.
  * **Zero-Quota Catalog Expansion & 50k Milestone (`fastPullGenreTracks.js` / `resolveVideoIds.js`):**
    * Dynamic candidate harvesting and artist diversity invariant adjustments for 50-track balancing pulls.
    * Playable verified catalog officially surpassed **50,800+ tracks** in Supabase `public.tracks`.

### `v0.7.3` — 2026-11-07
* **User-Scoped Favorites Partitioning, Self-Healing Cache & High-Speed Catalog Seeder:**
  * **Favorites Storage Partitioning & Zero Guest Bleed-Over (`favoritesService.js` / `userService.js`):**
    * Partitioned `localStorage` favorites keys by user ID (`musicmood_favorites_${userId}` for authenticated listeners vs `musicmood_favorites_guest` for guest sessions).
    * Implemented self-healing startup migration: automatically detects and purges any contaminated guest storage or legacy unscoped keys in existing browsers so guest users always start at 0 favorites.
    * Added `switchUserFavorites(newUserId)` to seamlessly transition favorites across persona switches, logins, and logouts.
    * Hardened cloud synchronization: guest sessions are strictly blocked from writing to Supabase `public.user_favorites`, eliminating accidental cross-account contamination.
  * **High-Speed External Catalog Expansion Engine (`fastPullGenreTracks.js`):**
    * Built an in-memory pre-indexed seeder eliminating database round-trips for duplicate checks ($O(1)$ RAM verification in 0.001ms).
    * Upgraded to 100-recording batch candidate harvesting from MusicBrainz with smart offset jumping past existing catalog depth, reducing rate-limit wait times by 95%.
    * Fixed 10 unmapped canonical MusicBrainz taxonomy tags (`pfunk` $\rightarrow$ `p-funk`, `avant_jazz` $\rightarrow$ `avant-garde jazz`, `west_coast_rap` $\rightarrow$ `west coast hip hop`, etc.).
    * Added `npm run pull-genres` and `npm run pull-genres:lowest` commands.
  * **Header Navigation Decluttering (`Dashboard.jsx`):**
    * Removed obsolete legacy 24-node `Visual Graph` pill from Dashboard header, leaving a clean, focused 3-pill navigation (`Calibrate Taste`, `Ingest Playlists`, `Favorites`).

### `v0.7.2a` — 2026-11-07
* **Welcome Screen Startup Checkbox, Human-Centered Tour Copy & Tagged Release Notes:**
  * **Automated Tag Release Notes & GitHub Actions Workflow (`release.yml`):**
    * Added `.github/workflows/release.yml` to automatically publish official GitHub Releases with formatted Markdown changelogs whenever a `v*` tag is pushed.
    * Added `scripts/extract-release-notes.js` and `scripts/tagWithReleaseNotes.js` (`npm run tag-release <tag>`), automatically binding the multi-line changelog to Git tag annotations (`git show vX.Y.Za`).
  * **"Don't show on startup" Checkbox (`WelcomeSplash.jsx` / `Dashboard.jsx`):**
    * Added an interactive toggle `[x] Don't show this welcome screen on startup` (checked by default) directly on the welcome hero card.
    * Wired user preference persistence to `localStorage.musicMood_welcome_seen`: unchecking allows the splash to greet the user again on future sessions, while keeping it checked prevents auto-display.
    * The `✨ How It Works` button in the header nav remains available at all times for on-demand review.
  * **Copy Refinement for Guided Tour Steps 4 & 5 (`GuidedTour.jsx`):**
    * Replaced rigid technical engineering jargon with user-centric benefit copy:
      * *Step 4 (Player):* Renamed to **"Music That Never Gets Stale"** — *"We built MusicMood to eliminate streaming fatigue. The player constantly rotates artists and styles in the background so you never get trapped hearing the same five songs on repeat."*
      * *Step 5 (Surprise Me):* Renamed to **"Instant Variety on Demand"** — *"Ready for something different? Hit 'Surprise Me' to leap to a new genre that naturally fits your flow—no jarring tempo drops, no mood killers."*
    * Refined Pillar 1 on `WelcomeSplash.jsx` to reflect the streaming fatigue elimination benefit.

### `v0.7.2` — 2026-11-07
* **Welcome Screen Manifesto & Interactive 6-Stop Guided Spotlight Tour:**
  * **Option 1 Glassmorphic Welcome Splash (`WelcomeSplash.jsx`):**
    * Added an atmospheric glassmorphism welcome modal highlighting user intent and anti-drift architecture:
      * *Headline:* *"Are you tired of AI algorithms telling you what you should listen to?"*
      * *3 Value Pillars:* You Steer (2-track dwell cap & 15-artist cooldown), Calibrated Mood Homes (Focus, Chill, Energetic, Sad, Party), and Leashed Discovery (Familiar, Balanced, Deep Cuts).
      * *Action:* 1-click launcher for the 60-second interactive guided tour.
  * **Interactive Guided Spotlight Tour (`GuidedTour.jsx`):**
    * Built a live 6-stop spotlight tour that dims the screen, illuminates each real interface widget, and positions floating guidance cards:
      1. `🎛️ Calibrate Taste`: 6-point sound polygon & dealbreaker exclusions.
      2. `📥 Ingest Playlists`: Zero-quota YouTube library synchronization.
      3. `🧠 Steer by Headspace`: 6 core moods anchored to personal home genres.
      4. `🎧 Anti-Drift Player`: Guarded playback with 2-track node cap.
      5. `🎲 Surprise Me`: Context-aware harmonic leaps on demand.
      6. `🧭 Discovery Tiers`: Governing exploration horizon (1-hop, 2-hop, unrestricted).
  * **Header Access & Landing Page Alignment:**
    * Added a permanent `✨ How It Works` pill to the dashboard header nav so listeners can revisit the tour anytime.
    * Aligned pre-login landing page copy in `App.jsx` with the anti-drift manifesto.

### `v0.7.1` — 2026-11-07
* **Harmonic Graph Bridge Enrichment & Discovery-Governed "Surprise Me" Traversal:**
  * **Strict Discovery-Governed Jump Bounds (`sessionStateMachine.js`):**
    * Wired active Discovery level directly to the **🎲 Surprise Me** jump radius, calculated relative to the currently playing active node:
      * **Familiar (0.2):** Max **1 hop** (immediate harmonic neighbor or sister subgenre in the same family, e.g. *Hard Rock* $\rightarrow$ *Heavy Metal* / *Alt Rock*).
      * **Balanced (0.5):** Max **2 hops** (adjacent harmonic bridge, smooth transition).
      * **Deep Cuts (0.85):** **Unrestricted** (3+ hops, actively boosting adventurous cross-genre discoveries).
    * Replaced the silent fallback bug with **Strict Nearest-Neighbor Fallback**—if no candidate exists at the requested distance, the engine snaps to the closest available tier rather than jumping randomly across the graph.
  * **Taste Graph Harmonic Bridge Enrichment (`tasteGraph.js`):**
    * Resolved all isolated genre nodes across the 6 core moods by adding 24 canonical harmonic cross-genre bridges:
      * *Dance / Party:* Added `dance_pop` $\leftrightarrow$ `house`, `dance_pop` $\leftrightarrow$ `funk`, `dance_pop` $\leftrightarrow$ `synthwave`, `house` $\leftrightarrow$ `funk`, `funk` $\leftrightarrow$ `salsa`, `ska` $\leftrightarrow$ `punk_rock`, `afrobeat` $\leftrightarrow$ `salsa`.
      * *Focus / Classical:* Added `baroque` $\leftrightarrow$ `chamber_music`, `baroque` $\leftrightarrow$ `neo_classical`, `chamber_music` $\leftrightarrow$ `neo_classical`, `chamber_music` $\leftrightarrow$ `cool_jazz`.
      * *Rock / Metal:* Added `doom_metal` $\leftrightarrow$ `post_rock`, `doom_metal` $\leftrightarrow$ `shoegaze`, `nu_metal` $\leftrightarrow$ `hard_rock`, `nu_metal` $\leftrightarrow$ `metalcore`, `hard_rock` $\leftrightarrow$ `grunge`.
      * *Chill / Ambient / Soul:* Added `chillout` $\leftrightarrow$ `house`, `shoegaze` $\leftrightarrow$ `ambient`, `delta_blues` $\leftrightarrow$ `singer_songwriter`.
    * Cleaned up invalid edge endpoints (`sludge`, `swing`, `honky_tonk`), resulting in 100% reachable graph connectivity.
  * **Dynamic UI Tooltip (`Player.jsx`):**
    * The "Surprise Me" button tooltip dynamically reflects the active discovery constraint (e.g. `Surprise Me (Familiar: 1-hop jump)`, `Surprise Me (Balanced: ≤ 2-hop jump)`).

### `v0.7.0a` — 2026-11-07
* **Loosen Step 3 Onboarding Genre Selection & Minimal Mood Tooltips:**
  * **Minimal Mood Pill Hover Tooltips (`MoodBar.jsx`):**
    * Stripped verbose status prefixes (`Sad • Home: Chicago Blues`); hover tooltips now output solely the clean, human-readable genre name (`Chicago Blues`, `Baroque (Bach, Vivaldi)`).
  * **Unrestricted Full-Spectrum Step 3 Genre Picker (`OnboardingWizard.jsx`):**
    * The "More..." dropdown now provides all 115 ontology genres organized into 14 distinct `<optgroup>` families (`Metal`, `Rock`, `Electronic`, `Hip-Hop`, `Jazz`, `Classical`, etc.) preceded by a curated `⭐ Recommended for {Mood}` group. Users are never restricted from choosing any subgenre as their Home Anchor.
    * Expanded quick chips for core moods: `Energetic` now features dedicated 1-click Metal anchors (`Heavy Metal`, `Thrash Metal`) alongside Hard Rock, Punk, Synthwave, Drum & Bass, Boom-Bap, and Afrobeat.
  * **Ontology & Mood-Mapping Expansion (`tasteGraph.js`):**
    * Broadened `MOOD_GENRE_MAP` across all core moods: `energetic` now maps 19 genres including the complete spectrum of Metal (`heavy_metal`, `thrash_metal`, `metal`, `prog_metal`, `nu_metal`, `metalcore`, `symphonic_metal`); `sad` includes `doom_metal` and `ambient`; `party` and `focus` now feature comprehensive style coverage.
  * **Softer Predictive Engine Balancing (`sessionStateMachine.js`):**
    * Softened radar pole weighting from aggressive winner-take-all exponent `1.4` down to linear `1.0` so high radar values provide a natural bias without locking out adjacent or cross-genre styles.
    * Added calibrated target energies per mood (`energetic`: 0.85, `workout`: 0.90, `focus`: 0.45, etc.) and enabled dynamic prediction during onboarding via `poleValues`.

### `v0.7.0` — 2026-11-07
* **Complete Headspace Behavioral Matrix (6 Core Mood Homes & Orbital Deviation Engine):**
  * **Step 3 Onboarding Redesign (6 Core Mood Homes Matrix):**
    * Rebuilt Step 3 in `OnboardingWizard.jsx` into a clean 2x3 matrix capturing the user's calibrated Home Anchor for each of the 6 core moods (`Focus`, `Chill`, `Energetic`, `Happy`, `Sad`, `Party`).
    * Arrives 100% pre-filled with predictive recommendations calculated from the user's Step 1 Sonic Radar (0 clicks required to accept).
    * Features 4–5 quick-switch chips per mood card for effortless 1-tap customization without scrolling or typing, plus a compact "More..." dropdown for deep cuts.
  * **Hybrid Deviation Model (Magnitude + Direction):**
    * Implemented `getGraphDistance(genreA, genreB)` for topological magnitude (shortest path harmonic hops).
    * Implemented `getVectorDeviation(genreA, genreB)` for acoustic drift direction ($\Delta E$ energy delta + Sonic Radar pole vectors).
  * **Orbital Discovery Leash:**
    * Mapped the 3 discovery toggles to orbital leashes around the mood's Home:
      * **Familiar:** Strict leash ($d = 0$). Keeps session locked to Home.
      * **Balanced:** Moderate leash ($d \le 2$ hops). Traverses neighboring clusters with elastic gravity.
      * **Deep Cuts:** Unrestricted leash ($d \ge 3$). Free traversal across compatible families.
    * Upgraded `sessionEngine.surpriseMe()` to enforce orbital bounds.
  * **Decluttered Mood Pill Hover Tooltips:**
    * In `MoodBar.jsx`, mood buttons remain visually minimal with zero badge pollution (`{emoji} {label}`).
    * Hovering over any mood pill reveals: `Focus • Home: Baroque (Bach, Vivaldi)`, and if currently playing and drifted: `Focus • Active: Synthwave (2 hops from Home) • Home: Baroque`.
  * **Live Orbital Telemetry in Player Header:**
    * Player card header dynamically indicates `🏠 Home` when at the anchor, or `Orbit: +N hops` when exploring outside the home base.

---

### `v0.6.2` — 2026-11-07
* **Seamless Google OAuth Login (No Redundant Scope Dialogs):**
  * Eliminated the mandatory `prompt: 'consent'` on regular user logins in `src/services/auth.js`.
  * Returning users logging in from mobile phones or desktop browsers authenticate instantly with 1-click account selection; scope consent is requested only on the first login or when manually clicking the "Grant YouTube Permission" re-auth button.
* **Sonic Radar Cloud Persistence Across Devices & Sessions:**
  * Added `calibration` JSONB column to `public.user_profiles` in Supabase with updated SECURITY DEFINER RPCs (`sync_user_calibration`, `get_user_calibration`, `resolve_or_create_user`).
  * The 6-point Sonic Radar star values (`rock_metal`, `electronic`, `hiphop_soul`, `jazz_blues`, `folk_acoustic`, `classical_ambient`), anchors, and dealbreakers are now fully stored in Supabase and synchronized on load to phones, tablets, and desktop browsers.
  * Added a direct "💾 Save & Apply" button on Step 1 of `OnboardingWizard.jsx` so users can sculpt their 6-point star and immediately apply it without paging through all steps.
  * Fixed initial panel state in `Dashboard.jsx` so mobile logins do not prematurely flash an uncalibrated wizard modal.
* **Predictive Listening Engine Tied to Mood & Sonic Radar DNA:**
  * Implemented `predictBestGenreForMood(moodId)` in `sessionStateMachine.js`: dynamically computes multi-dimensional affinity scores combining the user's 6-point Sonic Radar values, normalized node weights, anchor bonuses, and mood energy alignment.
  * When a user selects a mood, the playback engine intelligently predicts and routes to the genre matching their unique Sonic DNA (e.g. classical lovers get neoclassical/baroque on Focus; electronic heads get synthwave/IDM; rock fans get hard rock/grunge on Energetic).
  * Upgraded `🎲 Surprise Me` to traverse harmonic nodes weighted by the user's Sonic Radar profile.

---

### `v0.6.1` — 2026-11-07
* **User-Controlled Genre Stability (Anti-Random Shifting):**
  * Eliminated automatic background dwell-limit transitions and skip-fatigue hops. The player now stays locked on the user's active subgenre indefinitely.
  * Genre transitions are now strictly restricted to 2 events: (1) explicit user mood/genre selection, or (2) clicking the "Surprise Me" button.
* **`🎲 Surprise Me` Feature:**
  * Replaced the developer-centric `🔀 Step Node` button with a clean, consumer-facing `🎲 Surprise Me` action in the player utility bar without adding interface bloat.
  * When clicked, the engine intelligently picks an unexpected, high-affinity compatible genre within the active mood and immediately starts playing fresh tracks.
* **Player Header Decluttering:**
  * Removed technical `Dwell: 1/2 tracks Auto-shifting` countdown and `Fatigue: 0%` telemetry from the player header, leaving a clean, distraction-free playback card.

---

### `v0.6.0c` — 2026-11-07
* **UI Clean-up & De-bloat:**
  * Removed the persistent "Your Vibe Journey" history widget from the bottom of the main dashboard to eliminate visual clutter and keep the interface focused on playback and active controls.

---

### `v0.6.0b` — 2026-11-07
* **Header & Role Refinement:**
  * Restricted library track stats (`Playable`, `JIT Finds`, `Archive`) strictly to Admin accounts (`isAdmin()`). Non-admin users see a clean, consumer-focused header without database metrics.
  * Re-architected the header into two dedicated, stable tiers (Tier 1: Identity & Session, Tier 2: Views & Navigation).
  * Repositioned `🚪 Sign Out` to the far top right as a prominent, styled ruby-glass pill button.
* **YouTube Ingestion & Auth Resilience:**
  * Made private YouTube playlist fetching non-fatal in `Dashboard.jsx`, permanently eliminating blocking `Session Alert` lockouts.
  * Upgraded `PlaylistView` to always display `👤 My Playlists`.
  * Added 1-click in-app **`🔑 Grant YouTube Permission & Load`** button when OAuth scopes need renewal.
  * Enforced `{ prompt: 'consent' }` in Google Identity Services (GIS) so newly added scopes are never silently skipped.
* **Roadmap:**
  * Formally prioritized Custom Mood Defaults (Core 6 moods) in `ROADMAP.md` and `FEATURES.md`.

---

### `v0.6.0a` — 2026-11-07
* **Google Identity Services (GIS) Migration:**
  * Replaced deprecated implicit redirect OAuth flow with modern Google Identity Services popup auth (`@accounts.google.com/gsi/client`).
  * Complies 100% with Google's Secure Response Handling policy on public domains like Render.
* **Role-Based Access Control (RBAC) & Testing Personas:**
  * Added `user_class` column to `public.user_profiles` (`poweruser`, `beta`, `regular`, `guest`).
  * Granted `poweruser` tier and `admin` role to `corneliunitoi@gmail.com` via Supabase RPC `resolve_or_create_user`.
  * Added instant testing persona switcher in the header for fast permission validation.
* **Production Server:**
  * Created standalone Node HTTP server (`server.js`) with built-in zero-quota YouTube scrapers (`/api/resolve-track`, `/api/playlist-tracks`) and SPA routing.

---

### `v0.6.0` — 2026-11-07
* Initial production release on Render (`https://musicmood-ghx2.onrender.com`).
* Cloud favorites and calibration synchronization with Supabase.
* Single-select mutually exclusive panel navigation (`Calibrate Taste`, `Visual Graph`, `Ingest YouTube Playlists`, `Favorites`).

---

### `v0.5.9` — 2026-11-06
* **Track History Back Navigation & Interactive Progress Bar Scrubber:**
  * **Previous Track Navigation (`⏮️`):** Added a functional Back button to the player dock powered by a 25-track historical playback stack in `sessionStateMachine.js` with `localStorage` persistence.
  * **Bi-Directional Flow:** Outgoing track unshifts to the head of the queue when navigating backward, allowing seamless forward/backward traversal.
  * **Interactive Progress Bar Scrubber:** Dual-gradient progress bar (`#a855f7` to `#6366f1`) with live timestamps (`0:45 / 3:18`), supporting click-to-seek, drag-to-seek, and keyboard arrow controls.
  * **Tactile Feedback:** Custom circular scrubber thumb with hover scaling (`scale(1.3)`) and purple halo glow.

---

### `v0.5.8` — 2026-11-06
* **Audio Stall Watchdog, Chromium Unmuting Guard & JIT Genre Family Firewall:**
  * **6-Second Audio Stall Watchdog:** Proactively detects silent, stalled, or geoblocked streams; automatically purges the bad video ID from Supabase catalog, blacklists it from the session, and auto-advances to the next song without user intervention.
  * **Chromium Audio Pipeline Fix:** Expanded persistent player frame to 240×240 off-screen on `https://www.youtube.com`, preventing browser heuristics from suspending background media decoders.
  * **Aggressive State 5 / -1 Wakeup:** Automatically invokes `unMute()`, `setVolume(100)`, and `playVideo()` when YouTube places programmatic transitions into `CUED` (5) or `UNSTARTED` (-1) states.
  * **Truth-Based Playback Indicator:** Replaced premature "Now Playing" display with a truthful `Buffering Audio...` indicator (visualizer waves only animate when audio progress is verified).
  * **JIT Genre Family Firewall:** Strictly validates candidates against the active mood's genre family; prevents cross-genre leakage (e.g. Blues files mislabeled as Hip-Hop in local tags are saved to catalog under Blues, but never injected into a Hip-Hop session).

---

### `v0.5.7` — 2026-11-06
* **Offline-First Favorites Pane & Reactive Heart Controls:**
  * **0ms Latency Local Favorites:** Client-side `favoritesService.js` stores favorited tracks in `localStorage` with real-time `BroadcastChannel` synchronization across open browser tabs.
  * **Reactive Glowing Heart Control:** Dual-state glowing heart toggle (`❤️` / `🤍`) in the player dock provides immediate visual feedback and triggers subtle state machine affinity nudges.
  * **Dedicated Favorites Pane (`FavoritesPane.jsx`):** Comprehensive management drawer with instant title/artist search, genre filter chips, sequential **Play All**, single-track removal, and **Export to JSON** backup.
  * **Streamlined UI Header:** Replaced cluttered dashboard banner with a sleek, minimalist single-line heading (*"What headspace do you want right now?"*).

---

### `v0.5.6b` — 2026-11-06
* **Hybrid JIT Queue Buffer & Fast Innertube Resolution:**
  * **Dynamic Multi-Source Buffering:** Concurrently pulls candidate tracks from both the user's unmapped local archive and the MusicBrainz global catalog whenever the playback queue runs low.
  * **Fast Innertube YouTube Music Client:** Resolves local metadata tracks to playable YouTube streams in ~300ms using private JSON APIs with zero quota consumption.

---

### `v0.5.6` — 2026-11-06
* **JIT Organic Growth Monitor Modal & Safety Dislike Purge:**
  * **Live Catalog Growth Monitor (`JitFeedModal.jsx`):** Modal displaying newly resolved tracks dynamically injected into `public.tracks` in real time during playback sessions.
  * **Safety Dislike Purge:** Downvoting an automatically resolved track blacklists the artist for the session and flags invalid mappings for review.
  * **Catalog Audit Tool (`scripts/auditJitTracks.js`):** Script auditing all dynamically harvested tracks for genre consistency and playback health.

---

### `v0.5.5` — 2026-11-06
* **Up Next JIT Queue Drawer & Live Session History Sync:**
  * **Interactive Up Next Drawer:** Live queue drawer with dynamic `⚡ JIT` badge displays buffered tracks and allows 1-click playback.
  * **Live History Synchronization:** Tracks playback dwell times and records listening sessions to `public.listening_history`.
  * **NAS Scanner Hardening:** Added poison-pill recovery stripping null bytes and surrogate pairs from corrupted ID3 tags across local SMB storage.

---

### `v0.5.4` — 2026-11-06
* **JIT Organic Player Expansion & New Romantic Classifier Fix:**
  * **Organic Playback Ingestion:** Enabled auto-resolution of unmapped archive tracks on demand during playback.
  * **New Romantic / Synth-Pop Normalizer:** Fixed subgenre classification rules mapping 80s new romantic bands to canonical `synth_pop`.

---

### `v0.5.3` — 2026-11-05
* **Anti-Monopoly Artist Cap & Gatekeeper Hardening:**
  * **Strict Anti-Monopoly Cap:** Enforced `MAX_TRACKS_PER_ARTIST = 3` cap across all genres, eliminating catalog domination by prolific artists and ensuring genuine acoustic diversity.
  * **Innertube Anti-Bot Recovery:** Fixed false anti-bot cooldown triggers when resolving obscure or unmatched audio tracks.
  * **Song Gatekeeper Hardening:** Upgraded `isSongCandidate` to filter out compilations, full albums, and badge labels (`Song`, `Video`, `Album`) mistakenly parsed from YouTube Music headers.

---

### `v0.5.2` — 2026-11-05
* **Innertube YouTube Music JSON Engine:**
  * Introduced private Innertube client architecture (`resolveInnertubeTrack`) reducing track resolution time from 2.2s HTML scraping down to ~300ms pure JSON calls.
  * Added `--innertube` flag to catalog resolution tools.

---

### `v0.5.1` — 2026-11-05
* **Player Stream Links & MusicBrainz Genre Seeder:**
  * Added 1-click YouTube open and copy link buttons directly in the player dock for easy track sharing.
  * Added initial `seedGenresFromMusicBrainz.js` script to systematically populate under-represented ontology genres from MetaBrainz recordings.

---

### `v0.5.0` — 2026-11-05
* **Anti-Drift Session State Machine & 115-Node Canonical Ontology:**
  * **Anti-Drift Session State Machine:** Mathematically prevents algorithm fatigue using a 2-track node dwell cap, 15-artist cooldown, and dynamic node fatigue penalties.
  * **115 Canonical Genres across 14 Families:** Complete music ontology with harmonic transition edges (`TASTE_GRAPH_EDGES`).
  * **MusicBrainz Multi-Genre Integration:** Community metadata integration capturing secondary genre arrays (`secondary_genre_ids: text[]`).
  * **Zero-Quota YouTube Player:** Invisible persistent YouTube player streaming audio without burning Google Data API quotas.
  * **Sonic Calibration Wizard:** Analyzes user libraries to calculate acoustic DNA affinity weights and dealbreaker exclusions.
