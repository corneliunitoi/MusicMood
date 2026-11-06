# 📜 MusicMood — Comprehensive Features & Architecture

This document tracks the technical specifications, development milestones, and behavioral rules that govern the **MusicMood** application.

---

## 🏛️ Development Milestones & Feature History

### Milestone 1: YouTube OAuth & Foundation Discovery (v0.1.0)
* **OAuth 2.0 User Auth:** Implicit/AuthCode flow targeting Google Identity and YouTube Data API v3 (`auth.js`).
* **Profile & Playlist Sync:** Fetched user name, avatar, and existing public/private YouTube playlists for quick start.
* **Basic Mood Search:** Early prototype mapping simple moods (*Happy*, *Sad*, *Energetic*) to search query strings sent to YouTube's search endpoint.

---

### Milestone 2: Local Library Scanning & 44.8k Cloud Sync (v0.2.0)
* **Massive File Scanner:** Node.js pipeline (`scripts/scanLibrary.js`) recursively traversing local storage (e.g. `M:\Music`) for audio files (`.mp3`, `.flac`, `.m4a`, `.wav`, `.ogg`).
* **Audio Tag Extraction:** Deep inspection using `music-metadata` to extract ID3v2, Vorbis, and parent directory heuristics.
* **44,885 Song Archive:** Synchronized the entire personal library to Supabase PostgreSQL table `public.local_metadata`.
* **Cyrillic & Mojibake Healing:** Automatic detection and repair of Windows-1251/CP1252 character corruption on classic/foreign artist titles.

---

### Milestone 3: Schema v2 Architecture & Separation of Concerns (v0.3.0)
* **Catalog Decoupling:** Separated raw local file entries (`public.local_metadata`) from playable, verified YouTube streams (`public.tracks`).
* **Normalized Artists Table:** Created `public.artists` with unique constraints, MusicBrainz identifiers (`mbid`), primary genres, and disambiguation.
* **Foreign Key Relational Integrity:** Linked 44,000+ tracks to artists via indexed `artist_id` foreign keys with `ON DELETE SET NULL`.
* **Multi-Genre Arrays:** Implemented PostgreSQL native `text[]` arrays (`secondary_genre_ids`) with GIN indexing for multi-genre filtering.

---

### Milestone 4: Anti-Drift Session State Machine (v0.4.0)
* **Mathematical Invariant Guards:**
  - **Node Dwell Limit:** Strictly caps playback in a single subgenre to 2 consecutive tracks before automatically shifting along harmonic graph edges.
  - **Artist Satiation Cooldown:** Maintains a 15-artist sliding window to prevent repetition of the same band or singer.
  - **Track History De-duplication:** 50-track exclusion buffer to prevent immediate replay loops.
* **Real-Time Steering Engine:**
  - **Dynamic Fatigue:** Each play in a genre accumulates fatigue penalty: $\text{Suitability} = \text{Affinity} \times (1 - \text{Fatigue}) \times \text{HarmonicProximity}$.
  - **Discovery Radius:**
    - *Familiar (0.2):* Anchored exclusively to 1-hop harmonic neighbors and user favorites.
    - *Balanced (0.5):* Expands to 1-hop and 2-hop harmonic neighbors + mood-compatible clusters.
    - *Deep Cuts (0.85):* Traverses anywhere in the graph outside user dealbreakers.
* **Dealbreaker Filter:** Instant candidate rejection based on negative sound attributes (e.g., *No Mumble Rap*, *No Harsh Growls*, *No Commercial Festival EDM*, *No Bro-Country*).

---

### Milestone 5: 115-Node Canonical Music Taxonomy (v0.4.5)
* **14 Major Genre Families:**
  - `rock`, `metal`, `electronic`, `pop`, `hip_hop`, `rnb_soul`, `jazz`, `blues`, `classical`, `folk_acoustic`, `country`, `world_reggae`, `ambient_chill`, `avant_garde`.
* **17 Umbrella Parent Genres:** Enabled top-level exploration for users who do not know obscure subgenres (e.g., choosing `rock` or `classical` directly).
* **98 Granular Subgenres:** RYM/AllMusic-compliant subgenres with curated energy ratings, default vocal tendencies (*Instrumental*, *Vocal*, *Any*), and harmonic graph transition edges in `TASTE_GRAPH_EDGES`.
* **100% Catalog Normalization:** Every track in `public.tracks` maps to a canonical ID from this taxonomy.

---

### Milestone 6: MusicBrainz Community Multi-Genre Integration (v0.4.8)
* **MetaBrainz Authority:** Switched from fragile regex guessing to the open, non-profit MusicBrainz API (`https://musicbrainz.org/ws/2/`).
* **Multi-Genre Tag Extraction:** Extracts community-voted genre tags and weights them by vote count.
* **Multi-Genre Bands:** Accurately classifies artists that span multiple sounds (e.g., *Dead Can Dance* $\rightarrow$ `synthwave` + `[rock, new_age, post_punk, ambient, classical]`).
* **Batch Artist Reconciliation Script:** [`scripts/enrichArtistsFromMusicBrainz.js`](file:///c:/Visual%20studio/MusicMood/scripts/enrichArtistsFromMusicBrainz.js) reconciles distinct artists, updates `public.artists`, and automatically cascades the canonical tags to all songs by that artist.
* **Rate-Limit Compliance:** Built-in 1,100ms request queue with 503 backoff retries respecting the MetaBrainz foundation policy.

---

### Milestone 7: Zero-Quota Scraper & Playback Resilience (v0.5.0)
* **Zero-Quota YouTube Playlist Ingester:** Ingests user playlists and extracts video IDs without burning daily Google Cloud Data API quotas.
* **Anti-Bot & Cookie Consent Bypass:** Hardened HTML scraper with `SOCS` cookie bypass headers and index-based `ytInitialData` extraction.
* **Strict Verification:** Filters out multi-hour compilations, STEM tracks, live interview podcasts, and game walkthroughs using duration bounds and channel verification.
* **Fail-Safe Sourcing Waterfall:**
  - **Tier A (Strict):** Guard-checked track within active genre and 15-artist cooldown.
  - **Tier B (Relaxed):** Relaxes cooldown if genre has limited artists (avoiding only current track).
  - **Tier C (Emergency Catalog):** Draws from the 4,326 verified tracks to guarantee 0% dropout rate.
* **Non-Destructive Downvote:** Thumbs-down button records personal feedback in `listening_history`, blacklists the artist for the session, and nudges the graph without deleting global database mappings.

---

### Milestone 8: Sonic Calibration & Minimalist UI (v0.5.0)
* **Sonic Calibration Wizard:**
  - 1-click **"✨ Calibrate from Library"** scans user's 44,885 tracks to calculate exact genre affinity weights.
  - Interactive grid displaying all 115 genres with family tags.
  - Dealbreaker toggles with transparent acoustic rationale.
* **Low-Friction Player Controls:**
  - Single **Energy Slider** (0% to 100%).
  - **Vocal Mode Switcher** (*Any*, *Instrumental Only*, *Vocals*).
  - **Discovery Tier Toggles** (*Familiar*, *Balanced*, *Deep Cuts*).
  - **Family-Grouped Active Node Selector:** `<select>` with `<optgroup>` for all 115 genres.
  - Cluttered Nuance/Situation dropdowns tucked away to keep the interface fast and clean.

---

### Milestone 9: Catalog Expansion & Anti-Monopoly Cap (v0.5.3)
* **MusicBrainz Automated Seeding:** Ingested 3,402 verified playable tracks across all 115 taxonomy nodes via `seedGenresFromMusicBrainz.js`, bringing the catalog to 26,882 tracks across 5,325 artists.
* **Strict Anti-Monopoly Cap:** Enforces `MAX_TRACKS_PER_ARTIST = 3` cap across all genres, eliminating catalog domination by prolific artists and ensuring genuine acoustic diversity.
* **Gatekeeper Hardening:** Upgraded `isSongCandidate` to filter out compilations, full albums, and badge labels (`Song`, `Video`, `Album`) mistakenly parsed from YouTube Music headers.

---

### Milestone 10: Deduplicated Scanner & Poison-Pill Recovery (v0.5.5)
* **Fast Recursive NAS Engine:** Scanned 43,651 audio files across local SMB storage (`\\192.168.0.2\e$\music`) in 13.9 minutes, syncing 40,977 unique deduplicated tracks into `public.local_metadata` (51,254 total indexed paths).
* **Persistent Artist Disk Cache:** Caches normalized artist-to-genre mappings in `scripts/cache/artist_genre_cache.json` for lightning-fast differential rescans.
* **Poison-Pill Recovery & Sanitization:** Automatically strips PostgreSQL null bytes (`\u0000`) and surrogate pairs from corrupted ID3 tags, preventing transaction aborts on corrupted files.
* **Skip-Already-Present Logic:** Differential scanner avoids reprocessing files already present in the database.

---

### Milestone 11: Organic Just-In-Time (JIT) Discovery Engine (v0.5.6)
* **Zero-Quota Fast Innertube Resolver:** Dynamic `/api/resolve-track` proxy translates local artist/title strings into verified playable YouTube video IDs in <300ms without consuming Google API quotas.
* **Hybrid Dual-Buffer Pipeline:** Concurrently pulls candidate tracks from both the user's unmapped local archive and the MusicBrainz global catalog whenever the playback queue runs low.
* **Organic Database Expansion:** Every newly resolved track is dynamically inserted into `public.tracks` with full canonical and secondary genre tags, allowing the global library to grow passively during listening sessions.
* **Interactive Up Next Drawer:** Live queue drawer with dynamic `⚡ JIT` badge displays buffered tracks and allows 1-click playback.

---

### Milestone 12: Offline-First Favorites Pane & Reactive Toggle (v0.5.7)
* **0ms Latency Local Favorites:** Client-side `favoritesService.js` stores favorited tracks in `localStorage` with real-time `BroadcastChannel` synchronization across open browser tabs.
* **Reactive Glowing Heart Control:** Dual-state glowing heart toggle (`❤️` / `🤍`) in the player dock provides immediate visual feedback and triggers subtle state machine affinity nudges.
* **Dedicated Favorites Pane:** Comprehensive management drawer (`FavoritesPane.jsx`) with instant title/artist search, genre filter chips, sequential **Play All**, single-track removal, and **Export to JSON** backup.
* **Streamlined UI Header:** Replaced cluttered dashboard banner with a sleek, minimalist single-line heading (*"What headspace do you want right now?"*).

---

### Milestone 13: Audio Stall Watchdog, Chromium Unmuting & Genre Firewall (v0.5.8)
* **6-Second Audio Stall Watchdog:** Proactively detects silent, stalled, or geoblocked streams; automatically purges the bad video ID from Supabase catalog, blacklists it from the session, and auto-advances to the next song without user intervention.
* **Chromium Audio Pipeline Fix:** Expanded persistent player frame to 240×240 off-screen (`fixed, bottom: -9999px, opacity: 1`) on `https://www.youtube.com`, preventing browser heuristics from throttling or suspending background media decoders.
* **Aggressive State 5 / -1 Wakeup:** Automatically invokes `unMute()`, `setVolume(100)`, and `playVideo()` when YouTube places programmatic transitions into `CUED` (5) or `UNSTARTED` (-1) states.
* **Truth-Based Playback Indicator:** Replaced premature "Now Playing" display with a truthful `Buffering Audio...` indicator (visualizer waves only animate when audio progress is verified).
* **JIT Genre Family Firewall:** Strictly validates candidates against the active mood's genre family; prevents cross-genre leakage (e.g. Blues files mislabeled as Hip-Hop in local tags are saved to catalog under Blues, but never injected into a Hip-Hop session).
* **Canonical Artist Knowledge Base:** Added Ray Charles, soul/blues pioneers, and legendary rap icons to Tier 1 canonical mappings.

---

### Milestone 14: Track History Back Navigation & Interactive Progress Scrubber (v0.5.9)
* **Previous Track Navigation (`⏮️`):** Added Back button to the player dock powered by an active 25-track historical playback stack in `sessionStateMachine.js` with `localStorage` persistence.
* **Forward-Backward Flow:** Outgoing track is unshifted to the head of the queue when going back, so clicking Next (`⏭️`) seamlessly returns to where you were.
* **Interactive Progress Bar & Scrubber:** Dual-gradient progress bar (`#a855f7` to `#6366f1`) with live tabular timestamps (`0:45 / 3:18`). Supports smooth click-to-seek, drag-to-seek, and keyboard arrow controls.
* **Tactile Styling:** Custom circular thumb with scale animation (`scale(1.3)`) and purple halo glow on hover.

---

### Milestone 15: Universal Sonic DNA Radar & Emotional Reflex Profiler (v0.6.0)
* **Interactive 6-Point Multi-Vertex Draggable Radar:** Completely rebuilt `OnboardingWizard.jsx` with an SVG-based multi-point radar allowing users to independently sculpt 6 canonical sound pillars (`🎸 Rock & Metal`, `⚡ Electronic & Synth`, `🎤 Hip-Hop & Soul`, `🎷 Jazz & Blues`, `🌾 Folk & Acoustic`, `🎻 Classical & Ambient`) without 2-pole directional bias.
* **Instant Preset Starting Shapes:** 1-click preset shapes (`⚖️ All Balanced`, `🎸 Rock + Classical`, `⚡ Electronic + Rock`, `🎷 Jazz & Blues + Soul`) for rapid calibration.
* **Dynamic Acoustic Archetype Engine:** Real-time archetype classification (e.g. *The Progressive Architect*, *The Cyber-Rocker*, *The Roots Connoisseur*, *The Blue Note Groover*, *The Ambient Alchemist*) providing live behavioral feedback as points deform.
* **Emotional Reflexes & Instant Dealbreaker Shield:** Fast 1-tap emotional configuration for melancholy response (*Lean Into It* vs *Lift My Spirits*), deep focus vocal handling (*100% Instrumental* vs *Vocals Welcome*), instant dealbreaker shields, and Anti-AI gatekeeping.
* **Dynamic Seed Artist Resonance:** Automatically matches curated seed artists based on the custom polygon shape with 1-click toggling and instant custom artist search.
* **Universal Decoupling:** Replaced hardcoded local NAS table requirements with an in-memory & Supabase/localStorage normalized weight synthesizer, while preserving optional local NAS scanning for power users.

---

## 🔮 Feature Backlog (Upcoming Roadmap)

### 1. Artist Finder & Favorites ("Artist Radio")
* **Search & Autocomplete:** Search for any artist across the 44.8k archive and 4.3k verified catalog.
* **Artist Profile View:** View an artist's MusicBrainz tags, biography, discography in the library, and primary genres.
* **Favorite Toggle & Radio Seed:** Star an artist to increase their base affinity weight in the state machine or launch an instant station seeded from their sound.

### 3. Experimental: YouTube "MusicMood Favorites" Auto-Sync
* **One-Click Favorite:** Liking a track with ❤️ can optionally append that video ID directly to a dedicated playlist titled `"MusicMood Favorites"` in the user's authentic YouTube account.
* **Overwriting Protection:** Uses single-playlist append-only mode to prevent overwriting or deleting any of the user's pre-existing YouTube playlists.

### 4. User-Selected Localized / Regional Music
* **Optional Language Filter:** Allow users to request music in specific languages (e.g., French, Romanian, Japanese, Spanish) on demand.
* **Non-Invasive:** Kept strictly outside the core engine defaults so regional music never plays unless explicitly chosen by the user.

---

## 📐 Key Specifications & Invariant Rules

| Metric | Specification | Rationale |
|---|---|---|
| **Max Node Dwell** | 2 tracks | Prevents falling into repetitive genre fatigue. |
| **Artist Cooldown** | 15 artists | Prevents artist over-representation in smaller subgenres. |
| **History Buffer** | 50 tracks | Prevents immediate track replaying during long sessions. |
| **Max Discovery Share** | 25% | Prevents a single anchor from monopolizing 100% of the session. |
| **Min Floor Share** | 5% | Guarantees room for serendipitous exploration. |
| **MusicBrainz Rate Limit** | 1.1s per request | Complies with MetaBrainz Foundation API policy. |
| **Catalog Fail-Safe** | 3-tier waterfall | 0% track dropout even during zero YouTube token conditions. |
