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

### Milestone 16: Airy Dashboard Architecture & Anti-Stagnation Engine (v0.6.0)
* **Airy Headspace Interface:** Removed obsolete and cluttered Active Anchors banner from the main landing view, opening up vertical breathing room and centering user focus purely on playback and mood.
* **Segmented Floating Vibe Deck:** Replaced rigid 4+2 wrapped buttons and 4 clunky native HTML `<select>` dropdowns with an elegant segmented glassmorphic control (`✨ Core`, `🏃 Activities`, `🎨 Nuances`, `🔮 Aesthetics`, `🎬 Cinematic`).
* **Symmetrical & Tactile Mood Shelf:** Clean, balanced pill chips (5–7 per category) with smooth hover elevation, soft ambient glow, and an electric indigo-to-purple gradient halo on the active selection.
* **Reactive Active Vibe Indicator:** Pulsating purple indicator dot on the category tab shows at a glance which category holds the currently playing headspace.
* **Anti-Loop & De-Duplication Engine:**
  - Implemented seen-artist deduplication per candidate pool to prevent artist clustering (e.g. Senmuth/Mechina repetition).
  - Dynamic random offset sampling (`.range(randOffset, randOffset + 50)`) and Fisher-Yates array shuffling on emergency fallbacks.
  - Satiation fatigue edge escape: 3 consecutive skips in a single genre automatically transition along harmonic graph edges to an adjacent genre cluster.
  - Guarded reset: resetting or changing moods randomly samples from top compatible anchors and compatible subgenres.

---

## 🔮 Feature Backlog (Upcoming Roadmap)

### 1. Artist Finder & Favorites ("Artist Radio")
* **Search & Autocomplete:** Search for any artist across the 44.8k archive and 4.3k verified catalog.
* **Artist Profile View:** View an artist's MusicBrainz tags, biography, discography in the library, and primary genres.
* **Favorite Toggle & Radio Seed:** Star an artist to increase their base affinity weight in the state machine or launch an instant station seeded from their sound.

### 2. Behavioral Specification & Acoustic Engine for Headspace Pills ("The Vibe Engine")
Establish formal acoustic parameter vectors, steering constraints, and dynamic catalog filtering for each of the 5 categories and 30 mood pills so they actively sculpt playback rather than serving solely as genre labels.

#### A. Architecture & Parameter Dimensions
Each pill defines a multi-dimensional acoustic steering vector that modifies the Session State Machine:
1. **Target Energy ($E \in [0.0, 1.0]$):** Governs perceived intensity, tempo (BPM), percussion aggression, and dynamic loudness.
2. **Target Valence ($V \in [0.0, 1.0]$):** Governs musical positiveness and harmonic mode (minor/dissonant vs major/consonant).
3. **Vocal Policy:**
   - `instrumental_strict`: 100% instrumental (essential for deep study, sleep, dark ambient).
   - `instrumental_preferred`: Relaxes to instrumental if available, allows low-density vocal textures.
   - `vocal_prominent`: Prioritizes lyrics, singalong hooks, and vocal delivery (pop, rap, soul, indie).
   - `any`: Balanced distribution.
4. **Timbre & Texture Bias:**
   - `acoustic`: Natural acoustic instruments (strings, piano, upright bass, acoustic guitar, brass).
   - `synthetic`: Synthesizers, modular pads, drum machines, 808s, futuristic sound design.
   - `electric / distorted`: Overdriven guitars, tube amps, analog fuzz, aggressive edge.
   - `hybrid`: Seamless fusion of organic and electronic elements.
5. **Harmonic Hop Constriction ($H \in \{1, 2, \infty\}$):**
   - $H=1$ (Tight): Restricts transitions strictly to 1-hop direct neighbors in `TASTE_GRAPH_EDGES`.
   - $H=2$ (Organic): Allows harmonic exploration across 2-hop clusters.
   - $H=\infty$ (Free): Traverses any node in the category cluster that respects dealbreakers.
6. **Fatigue & Dwell Multiplier:** Modulates how quickly a user fatigues of a genre node (e.g. *Party* fatigues fast to keep rotation lively; *Ambient* has low fatigue to sustain deep immersion).

#### B. Complete Headspace Behavioral Matrix (30 Pills)

##### 1. ✨ Core Headspaces (Foundational Emotions)
* **😊 Happy:** $E: 0.65 - 0.85$ | $V: 0.75 - 1.00$ | Vocals: `vocal_prominent` | Timbre: `hybrid` | Genres: *Pop, Funk, Neo-Soul, Disco, Uplifting Indie, Dance-Pop*. High danceability, infectious hooks, major-key harmony.
* **😢 Sad:** $E: 0.15 - 0.40$ | $V: 0.05 - 0.30$ | Vocals: `any` | Timbre: `acoustic` | Genres: *Indie Folk, Melancholic Ballads, Slow Blues, Emo, Chamber Pop*. Intimate vocals, minor/dorian scales, acoustic guitar, felt piano.
* **🧘 Chill:** $E: 0.30 - 0.50$ | $V: 0.45 - 0.65$ | Vocals: `any` | Timbre: `hybrid` | Genres: *Lofi Hip-Hop, Downtempo, Smooth Jazz, Chillwave, Dub Reggae*. Mid-tempo groove, warm low-end, relaxed laid-back swing.
* **⚡ Energetic:** $E: 0.80 - 1.00$ | $V: 0.50 - 0.80$ | Vocals: `any` | Timbre: `electric / synthetic` | Genres: *Electro House, Synthwave, Hard Rock, Drum & Bass, Hype Trap*. High BPM (128–174), punchy transients, driving rhythm sections.
* **🧠 Focus:** $E: 0.30 - 0.50$ | $V: 0.40 - 0.60$ | Vocals: `instrumental_strict` | Timbre: `hybrid` | Genres: *Neoclassical, Minimalist Ambient, Lofi Beats, IDM*. Zero vocal distractions, steady unvarying tempo, cognitive flow optimization.
* **🎉 Party:** $E: 0.75 - 0.95$ | $V: 0.70 - 0.90$ | Vocals: `vocal_prominent` | Timbre: `synthetic` | Genres: *Hip-Hop/Rap, Dancehall, Tech House, Latin Pop, Nu-Disco*. Heavy kick drums, call-and-response hooks, crowd-energizing pacing.

##### 2. 🏃 Activities (Functional Contexts)
* **🌅 Morning Boost:** $E: 0.50 \rightarrow 0.70$ (ascending curve) | $V: 0.65 - 0.85$ | Vocals: `any` | Genres: *Morning Indie, Bossa Nova, Motown Soul, Acoustic Pop*. Awakening tempo, bright acoustic textures, sunrise optimism.
* **📚 Study:** $E: 0.25 - 0.45$ | $V: 0.40 - 0.60$ | Vocals: `instrumental_strict` | Genres: *Ambient Piano, Chillhop, Modular Synth Drones, Neoclassical*. Low dynamic variance, non-intrusive frequency spectrum.
* **💪 Workout:** $E: 0.85 - 1.00$ | $V: 0.40 - 0.75$ | Vocals: `any` | Genres: *Metalcore, Industrial, Hardstyle, Trap, Aggressive EDM*. Sustained high BPM (130–165), visceral drops, maximum workout adrenaline.
* **🚗 Roadtrip:** $E: 0.60 - 0.80$ | $V: 0.60 - 0.85$ | Vocals: `vocal_prominent` | Genres: *Classic Rock, Americana, Heartland Rock, Indie Anthems, Funk*. Open-road motoring tempo (100–120 BPM), singalong choruses, rich dynamic storytelling.
* **🌧️ Rainy Day:** $E: 0.20 - 0.45$ | $V: 0.25 - 0.45$ | Vocals: `any` | Genres: *Acoustic Blues, Cool Jazz, Coffeehouse Singer-Songwriter, Post-Rock*. Warm room reverb, vinyl crackle, introspective minor chords, comforting gloom.
* **🌃 Late Night:** $E: 0.30 - 0.55$ | $V: 0.30 - 0.50$ | Vocals: `any` | Genres: *Dark Jazz, Trip-Hop, Vaporwave, Nocturnal R&B, Retrowave*. Sub-bass heavy, nocturnal neon atmosphere, smoking-room textures.
* **🌙 Wind Down:** $E: 0.05 - 0.25$ | $V: 0.40 - 0.60$ | Vocals: `instrumental_strict` | Genres: *Weightless Ambient, Sleep Drone, Soft Harp, Delta-Wave Neoclassical*. Zero abrupt drums, time-dilated decay, parasympathetic nervous system calming.

##### 3. 🎨 Nuances (Complex Emotional Micro-Climates)
* **📼 Nostalgic:** $E: 0.40 - 0.65$ | $V: 0.45 - 0.70$ | Genres: *80s Synthpop, 70s Soft Rock, 90s Alt-Rock, Oldies Soul*. Analog tape warmth, chorused guitars, memories of bygone eras.
* **💖 Romantic:** $E: 0.35 - 0.60$ | $V: 0.60 - 0.80$ | Genres: *Neo-Soul, Slow Jam R&B, Romantic Classical, French Chanson*. Sensual grooves, intimate breathy vocals, lush string arrangements.
* **🥀 Melancholic:** $E: 0.20 - 0.40$ | $V: 0.10 - 0.35$ | Genres: *Slowcore, Sadcore, Cello Solos, Dark Folk, Post-Rock*. Poetic sorrow, bittersweet beauty, spacious room to feel and reflect.
* **🌱 Hopeful:** $E: 0.50 - 0.75$ | $V: 0.70 - 0.90$ | Genres: *Cinematic Folk, Post-Rock Crescendos, Uplifting Choral, Gospel*. Gradual build from quiet solitude to soaring triumphant resolutions.
* **🌑 Dark / Intense:** $E: 0.70 - 0.95$ | $V: 0.10 - 0.30$ | Genres: *Darksynth, Gothic Rock, Doom Metal, Industrial Techno*. High harmonic tension, minor/diminished scales, brooding psychological weight.
* **☁️ Dreamy:** $E: 0.30 - 0.55$ | $V: 0.50 - 0.70$ | Genres: *Shoegaze, Dream Pop, Ambient Electronic, Ethereal Wave*. Washed-out reverb tails, shimmering tremolos, surreal out-of-body float.

##### 4. 🔮 Aesthetics (Internet Subcultures & Timbral Trope Clusters)
* **✨ Main Character:** $E: 0.70 - 0.85$ | $V: 0.65 - 0.85$ | Genres: *Indie Pop Anthems, Euphoric Electronic, Dynamic Art Pop*. Swelling anthems that make everyday walking feel like the climax of a movie.
* **😈 Villain Mode:** $E: 0.70 - 0.90$ | $V: 0.20 - 0.40$ | Genres: *Dark Trap, Phonk, Midtempo Cyber-Bass, Aggressive Rap*. Menacing swagger, distorted 808s, sinister half-time grooves.
* **🧸 Soft Vibes:** $E: 0.25 - 0.45$ | $V: 0.60 - 0.80$ | Genres: *Bedroom Pop, Cute Lofi, Indie Ukulele, Soft Acoustic*. Gentle acoustic strums, pastel aesthetics, cozy warmth.
* **🏛️ Dark Academia:** $E: 0.35 - 0.60$ | $V: 0.30 - 0.50$ | Genres: *Baroque, Romantic Era Classical, Solo Violin, Dark Jazz*. Candlelit library atmosphere, literary romance, virtuoso chamber counterpoint.
* **🍄 Cottagecore:** $E: 0.35 - 0.60$ | $V: 0.65 - 0.85$ | Genres: *Traditional Folk, Celtic Instrumental, Acoustic Bluegrass, Whimsical Indie*. Acoustic mandolins, wooden flutes, earthy pastoral storytelling.
* **🤖 Cyberpunk:** $E: 0.75 - 0.95$ | $V: 0.25 - 0.50$ | Genres: *Darksynth, EBM, Industrial Cyber, Neo-Tokyo Electro*. Neon-drenched arpeggios, mechanical rhythm precision, dystopian grit.

##### 5. 🎬 Cinematic (Narrative & World-Building Soundscapes)
* **⚔️ Epic:** $E: 0.80 - 1.00$ | $V: 0.50 - 0.75$ | Genres: *Orchestral Trailer, Hybrid Symphonic, Epic Choral, Film Battle Scores*. Massive brass stabs, taiko thunder, heroic brass fanfares.
* **🕵️ Mystery / Noir:** $E: 0.25 - 0.50$ | $V: 0.25 - 0.45$ | Genres: *Noir Jazz, Dark Ambient Strings, Suspense Underscore*. Muted trumpet cries, walking double bass in the shadows, unresolved chord tensions.
* **🧝 Fantasy:** $E: 0.40 - 0.70$ | $V: 0.55 - 0.80$ | Genres: *Celtic Orchestral, Medieval Tavern, Enchanted Forest Ambience*. Magical harp flourishes, bodhrán pulses, mythical escapism.
* **🛸 Sci-Fi:** $E: 0.40 - 0.70$ | $V: 0.35 - 0.60$ | Genres: *Space Ambient, Modular Electronic, Vangelis-style CS-80 Synth*. Cosmic sub-harmonics, interstellar expanse, futuristic electronic exploration.
* **🌫️ Ambient:** $E: 0.05 - 0.30$ | $V: 0.40 - 0.60$ | Genres: *Drone, Soundscape, Generative Music, Field Recordings*. Beatless floating textures, infinite decay, pure auditory atmosphere.

### 3. Experimental: YouTube "MusicMood Favorites" Auto-Sync
* **One-Click Favorite:** Liking a track with ❤️ can optionally append that video ID directly to a dedicated playlist titled `"MusicMood Favorites"` in the user's authentic YouTube account.
* **Overwriting Protection:** Uses single-playlist append-only mode to prevent overwriting or deleting any of the user's pre-existing YouTube playlists.

### 4. User-Selected Localized / Regional Music
* **Optional Language Filter:** Allow users to request music in specific languages (e.g., French, Romanian, Japanese, Spanish) on demand.
* **Non-Invasive:** Kept strictly outside the core engine defaults so regional music never plays unless explicitly chosen by the user.

### 5. "Ask AI What You Want" (Conversational Sonic Intent Parser)
* **Natural Language Vibe Prompting:** Allow users to describe their desired musical headspace in everyday human language (e.g., *"I'm coding late at night in the rain, give me something instrumental with deep bass and melancholic piano but no harsh drops"*, *"Something that feels like Blade Runner meets Pink Floyd"*, or *"High-energy 80s synth running music with female vocals"*).
* **Intent-to-Vector Translation:** Translates arbitrary natural language prompts into MusicMood's exact mathematical parameters:
  - Acoustic vector: Target Energy ($E$), Target Valence ($V$), Vocal Policy (`instrumental_strict`, `vocal_prominent`, etc.), and Timbral Texture.
  - Taxonomy anchor: Automatically maps the prompt to the closest node(s) across our 115-node canonical genre graph.
  - Ad-hoc dealbreakers: Dynamically infers and applies negative acoustic constraints (e.g., *"no screaming"*, *"no high-pitched synths"*).
* **Authentic Human Music Curation (Strict Anti-AI Audio Integrity):** The AI operates strictly as an intelligent acoustic curator and semantic router—**never** generating synthetic AI audio. Every selected song is verified authentic human music drawn from the user's 44.8k archive and verified MusicBrainz/YouTube catalog.
* **Seamless State Machine Steering:** Injects the synthesized intent directly into `sessionEngine.setMood()`, allowing immediate harmonic playback and auto-steering without manual slider configuration.

### 6. "Add Your Own Artist" (On-Demand Metadata & 10-Track Catalog Ingestion)
* **On-Demand Search & Disambiguation:** A clean search input in the UI allowing users to type any artist name (including niche, foreign, or underground acts). The engine queries the MusicBrainz API (`https://musicbrainz.org/ws/2/artist/`) to fetch canonical disambiguation, country, MBID, and community genre tags.
* **Taxonomy Normalization & Artist Registration:** Automatically normalizes community tags to MusicMood's 115-node canonical taxonomy and 14 parent families, upserting the artist record into PostgreSQL table `public.artists`.
* **Top 10 Track Harvest & Video ID Resolution:**
  - Identifies the artist's 10 most iconic/popular recordings via MusicBrainz and YouTube Music discography endpoints.
  - Automatically resolves playable, high-bitrate YouTube video IDs in <300ms using the zero-quota Innertube scraper (`/api/resolve-track`).
  - Passes candidate streams through verification gatekeepers (filtering out full-album compilations, reaction commentary, podcast interviews, and live bootlegs).
* **Instant Catalog Ingestion & Steering:**
  - Inserts all 10 verified tracks into `public.tracks` linked via `artist_id` with full canonical and secondary genre arrays.
  - Instantly exposes the new artist in the user's anchor seeds, favorites, or provides a 1-click **"Play Artist Radio"** launch button.
* **Eliminates Cold-Start Limits:** Enables the library to expand organically based on personal taste without requiring batch administrative seeding scripts.

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
