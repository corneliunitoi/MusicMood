# 🗺️ MusicMood Strategic Roadmap

This document outlines prioritized enhancements, user experience improvements, and upcoming architectural milestones for **MusicMood**.

---

## 🎯 High Priority (Next Milestone — v0.6.1)

### 1. 🎛️ Custom Default Subgenres per Mood (Core 6 Moods)
* **Problem:** Clicking a mood (such as *Party* or *Happy*) currently routes to a hardcoded genre cluster (`MOOD_GENRE_MAP`), often defaulting to genres the user rarely listens to (e.g. `funk` or `classic_soul`). Listeners must manually select their preferred genre each time.
* **Scope:**
  * Allow listeners to define and persist their preferred starting subgenre for at least the **6 core moods**:
    1. 😊 **Happy** (e.g., *Indie Pop*, *Dance-Pop*, *Bluegrass*, *Bossa Nova*)
    2. 😢 **Sad** (e.g., *Singer-Songwriter*, *Post-Rock*, *Delta Blues*)
    3. 🧘 **Chill** (e.g., *Lofi Hip-Hop*, *Neo-Soul*, *Chillout House*)
    4. ⚡ **Energetic** (e.g., *Synthwave*, *Hard Rock*, *Drum & Bass*)
    5. 🧠 **Focus** (e.g., *Neo-Classical*, *Minimalist Ambient*, *Lofi Beats*)
    6. 🎉 **Party** (e.g., *House*, *Dance-Pop*, *Nu-Disco*, *Hard Rock*)
* **UX Implementation:**
  * **Quick-Pin in Player:** A subtle 📌 *"Set as default for [Mood]"* button right beside the Active Node dropdown in the playback bar.
  * **Calibration Panel:** A dedicated *"Mood Defaults"* section inside the Taste Calibration view where users can select their go-to genre for each mood from their personal anchors.
* **Engine & Storage:**
  * `sessionEngine.setMood(moodId)` checks `calibration.moodDefaults?.[moodId]` before falling back to generic graph defaults.
  * Persisted locally in `localStorage` and synced to `user_profiles.calibration` in Supabase for cross-device consistency.

---

## 🚀 Near-Term Enhancements

### 2. 🔍 "Add Your Own Artist" (On-Demand Metadata & 10-Track Harvest)
* Search any artist on demand via MusicBrainz API (`https://musicbrainz.org/ws/2/artist/`).
* Automatically normalize community tags into MusicMood's 115-node taxonomy.
* Harvest the top 10 iconic tracks via YouTube zero-quota resolver (`/api/resolve-track`) and ingest them into `public.tracks`.
* Instantly create an on-demand artist radio station or anchor seed.

### 3. 🤖 "Ask AI What You Want" (Conversational Sonic Intent Parser)
* Natural language prompt input (e.g., *"I'm working late at night in the rain, give me something instrumental with deep bass and melancholic piano but no harsh drops"*).
* Converts semantic intent into mathematical engine parameters: Target Energy ($E$), Target Valence ($V$), Vocal Policy (`instrumental_strict`), and taxonomy anchor nodes.
* Strict Anti-AI Audio Integrity: Operates strictly as an intelligent acoustic curator—every selected song is authentic human music from our verified catalog.
* **Low-Priority Extension — Granular Vocal Control & Voice Input:**
  * Hands-free voice prompting via Web Speech API / microphone dictation.
  * Explicit vocal texture steering: strict instrumental, vocal-prominent, vocal chops/chants, or vocal gender/timbre preferences.

### 4. 🌍 User-Selected Localized / Regional Music
* Optional language filter (e.g., French, Romanian, Japanese, Spanish, Italian) on demand.
* Kept strictly opt-in so regional music never plays unless explicitly activated.

### 5. ❤️ YouTube "MusicMood Favorites" Auto-Sync
* Optional two-way or append-only sync from in-app Favorites into a dedicated playlist titled `"MusicMood Favorites"` on the user's authentic YouTube account.

### 6. 🔊 In-App Master Volume Slider & Mute Control
* **Problem:** Currently playback volume is locked to 100% in the underlying YouTube player (`setVolume(100)`). Users without hardware media keys cannot easily balance MusicMood against other audio.
* **Scope:**
  * Add a sleek, glassmorphic volume slider + mute toggle directly into the player control bar.
  * Persist the listener's preferred volume level across sessions in `localStorage`.

### 6. 📑 Dynamic Playlist Creation & Smart Favorites Curation (Concept Backlog)
* **Idea & Purpose:** Provide the ability to create, assemble, and manage playlists without cluttering the airy player interface.
* **Smart Auto-Pick from Favorites:**
  * Automatically analyze and cluster the listener's favorited / liked tracks by headspace, energy profile, or genre adjacency.
  * 1-click generation of thematic playlists (e.g., *Late Night Introspection*, *High-Velocity Workout*, *Deep Focus Instrumental*).
* **Flow & Integration Exploration (To Determine Later):**
  * Devise a clean, decluttered flow (e.g., initiated from a dedicated Favorites view, post-session recap, or minimal popup rather than overcrowding the playback bar).
  * Flexible export: option to keep as a virtual MusicMood session or sync directly to YouTube.

### 7. 📊 Sonic Analytics & Community Insights Dashboard
* **Purpose:** Celebrate listening habits, surface top hits across the community, and spotlight listener dedication with personal and global analytics.
* **Core Analytics Features:**
  * 🎵 **Most Popular Songs:** Top-streamed, most-favorited, and highest-completion tracks across all listening sessions (filterable by All-Time, Month, Week).
  * 🎸 **Top Artists Leaderboard:** Artists ranked by overall engagement and real-time `affinity_score`, distinguishing mainstream anchors from rising underground discoveries.
  * 👑 **Most Active User Spotlight ("The Pioneer's Podium"):**
    * Highlights the platform's #1 most active listener (`Corneliu / @me :D`) with total listening hours logged, tracks completed, songs favorited, and genre exploration breadth.
    * Personal listener card comparing your personal top rotation vs. platform-wide trends.
  * 🗺️ **Mood & Genre Flow Heatmap:** Visual breakdown showing which of the 6 core moods and 115 taxonomy nodes dominate morning, afternoon, and late-night listening.
* **Engine & Database Architecture:**
  * Backed by efficient, cached Supabase PostgreSQL RPCs (`get_platform_analytics()`, `get_listener_stats(user_id)`) querying existing `listening_history`, `user_favorites`, and `artists.affinity_score` with zero client-side calculation overhead.

### 8. ⚡ Catalog Rebalancing & Underrepresented Genre Overhaul (Bottom-Up Inverted Seeding)
* **The Root Cause (The "Top of the List" Skew):**
  * An audit of our 50,000+ track catalog reveals a massive structural imbalance caused by legacy folder scans and top-to-bottom sequential processing:
    * **The "Big 4" (Over 36,600 tracks — 75% of catalog):**
      * 🎸 **Rock:** 15,368 tracks
      * 🎻 **Classical:** 8,001 tracks
      * 🎷 **Jazz:** 7,276 tracks
      * ⚡ **Metal:** 5,960 tracks
    * **The Underrepresented 8 (Severely starved down the list):**
      * 🎛️ **Electronic:** 3,666 tracks *(1,200+ diluted in generic catch-all bucket)*
      * 🎤 **Pop:** 2,247 tracks *(970+ diluted, with rock legends like Dire Straits & Rolling Stones misclassified as Pop)*
      * 🎧 **Hip-Hop:** 1,668 tracks *(golden age boom-bap, west coast, conscious rap all < 185 tracks)*
      * 🪕 **Folk & Acoustic:** 1,426 tracks
      * 🎸 **Blues:** 1,214 tracks
      * 🎷 **Soul & Funk:** 1,039 tracks
      * 🪘 **Latin & World:** 736 tracks
      * 🌴 **Reggae:** 321 tracks
* **Architecture & Action Plan for Tomorrow:**
  * **1. Inverted Seeding Strategy (Bottom-Up Priority):**
    * Invert the candidate ingest loop (`ORDER BY genre_track_count ASC`) so background seeders and balancing runs strictly populate the bottom 8 genres first (starting with Reggae, Latin, Soul/Funk, Hip-Hop, Pop, Electronic) before touching Rock, Metal, or Classical.
  * **2. Tag Evacuation & Disambiguation Migration:**
    * *Pop Evacuation:* Move misclassified classic rock acts (*Dire Straits, Rolling Stones, Fleetwood Mac, Sting*) out of `pop` into `classic_rock` / `hard_rock`.
    * *Pop Subgenre Re-sorting:* Re-route authentic pop into `dance_pop` (Dua Lipa, Madonna), `synth_pop` (Depeche Mode, CHVRCHES), `art_pop` (Kate Bush, Björk, Lorde), and `mainstream_pop` (Michael Jackson, The Weeknd, Bruno Mars).
    * *Hip-Hop Decomposition:* Separate golden-age `boom_bap` (Wu-Tang, Nas, Biggie, Tribe), `west_coast_rap` (2Pac, Dr. Dre, Snoop), `conscious_hiphop` (Kendrick Lamar, J. Cole, Mos Def), and modern `trap_modern` (Travis Scott, Future).
  * **3. Targeted Artist Inflation for the Bottom 8 Families:**
    * Run `npm run inflate:artists` across the 10 foundational icons for each underrepresented family:
      * *Electronic:* Aphex Twin, Boards of Canada, Daft Punk, Kraftwerk, Massive Attack, Prodigy, Pendulum, Carpenter Brut.
      * *Hip-Hop:* Nas, Wu-Tang Clan, 2Pac, The Notorious B.I.G., Kendrick Lamar, A Tribe Called Quest, Outkast, Dr. Dre.
      * *Pop:* Michael Jackson, Prince, Madonna, Dua Lipa, The Weeknd, Kate Bush, Phoenix, Depeche Mode.
      * *Reggae & Latin:* Bob Marley, Peter Tosh, Burning Spear, Buena Vista Social Club, Celia Cruz, Antonio Carlos Jobim.
      * *Soul & Funk:* Stevie Wonder, Earth Wind & Fire, Marvin Gaye, Parliament, Curtis Mayfield, Aretha Franklin.
  * **4. Energy & Instrumental Filtering:**
    * Ensure electronic/ambient tracks have verified instrumental flags and hip-hop/pop have proper energy baselines so the 6 Core Moods (Focus, Chill, Party, Workout) never pull the wrong sonic texture.

### 9. 🏷️ In-Player "Wrong Genre / Misclassified" Flag & Re-Assignment Button
* **The Problem:**
  * When a track plays in the wrong genre (e.g., Dire Straits in Pop, or an ambient drone in Techno), listeners currently only have the Dislike (👎) button.
  * Disliking penalizes the artist's affinity score and risks purging a masterpiece song, when the song is actually great and simply has an incorrect genre tag.
* **UX & Interaction Design:**
  * Add a clean **"Wrong Genre" (🏷️)** action button in the player control bar next to Upvote/Favorite/Dislike.
  * **1-Click Healing Flow:**
    * Clicking immediately skips the track from the active session queue *without* downvoting the artist's affinity or purging the stream.
    * Displays a minimal glassmorphic popover: *"Where does this belong?"* featuring 1-click pills for the 14 parent genre families (e.g., `[Rock]`, `[Metal]`, `[Electronic]`, `[Jazz]`, `[Classical]`, `[Hip-Hop]`).
    * Clicking a family immediately updates `public.tracks.primary_genre_id` in Supabase, healing the catalog in real-time for all listeners.
* **Automated Self-Healing Backend:**
  * Tracks flagged with misclassification reports can also trigger a background lookup through our MusicBrainz / iTunes genre normalizer to re-verify the community consensus tags.

### 10. 🎛️ Taxonomy Rebalancing: Re-group `synth_pop` into `Electronic` & Reconcile Artist Plurality
* **The Problem:**
  * In `src/services/tasteGraph.js`, `synth_pop` was historically categorized under `group: 'Pop'` alongside `dance_pop` and `mainstream_pop`.
  * Consequently, foundational electronic and darkwave pioneers like **Depeche Mode**, **New Order**, **Orchestral Manoeuvres in the Dark (OMD)**, and **Pet Shop Boys** are automatically mapped to the **✨ Pop** parent genre family in the Artist Explorer.
  * In the tracks database, Depeche Mode's true catalog plurality is **`electronic`** (106 tracks vs. 97 tracks in `synth_pop`, and 0 tracks in `pop`).
* **Scope & Implementation:**
  1. **Taxonomy Realignment in `src/services/tasteGraph.js`:**
     * Change `GENRE_NODES['synth_pop'].group` from `'Pop'` to `'Electronic'`.
     * Correctly groups authentic synth pioneers with `synthwave`, `darksynth`, `industrial`, and `idm`.
  2. **Artist Plurality Reconciliation:**
     * Update `public.artists.primary_genre_id` to reflect actual track plurality (e.g. Depeche Mode -> `electronic`).
     * Ensure the sync script and nightly cron resolve plurality accurately when artists straddle related electronic subgenres.

---

## 📈 Completed Milestones

* [x] **v0.1.0:** YouTube OAuth 2.0 Auth & Foundation Discovery.
* [x] **v0.2.0:** Local Audio Scanner & 44.8k Song PostgreSQL Sync.
* [x] **v0.3.0:** Schema v2 Architecture (`public.tracks`, `public.artists`, `public.local_metadata`).
* [x] **v0.4.0:** Anti-Drift Session State Machine (2-track dwell cap, 15-artist cooldown, dynamic fatigue).
* [x] **v0.4.5:** 115-Node Canonical Music Taxonomy across 14 Genre Families.
* [x] **v0.4.8:** MusicBrainz Community Multi-Genre Integration (`secondary_genre_ids: text[]`).
* [x] **v0.5.0:** Zero-Quota YouTube Playlist Ingestion & 1-Click Sonic Calibration Wizard.
* [x] **v0.5.5:** Deduplicated SMB Scanner, NAS Ingestion & CP1252 Cyrillic Healing.
* [x] **v0.6.0:** Production Cloud Architecture on Render, Supabase Cloud Sync, Google Identity Services (GIS) Popup Auth, Role/Class RBAC, Single-Select Exclusive Paneling, and Responsive 2-Tier Header.
* [x] **v0.6.1:** User Mood Steering Lock (genre changes restricted strictly to user mood switches or Surprise Me button).
* [x] **v0.6.2:** Cloud Radar Persistence & Predictive Engine sync to Supabase.
* [x] **v0.7.0 / v0.7.0a:** 6 Core Mood Homes & Orbital Deviation Engine with unconstrained full-spectrum genre picker and clean tooltips.
* [x] **v0.7.4:** In-App User Feedback System, Muzike Network Share Ingestion (16,276 tracks), Full RLS Security Advisor Hardening on `user_favorites` and `local_metadata`, and Artist Discography Inflation Engine with Dynamic Affinity Triggers.
* [x] **v0.7.5:** In-Player "Wrong Genre" Misclassification Flagging (`public.track_genre_flags`), Offline Secondary Source Cross-Check & Consensus Healing Engine (`scripts/resolveFlaggedTracks.js`).
