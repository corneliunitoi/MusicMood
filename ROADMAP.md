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
