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

## 📋 Release Checklist

Whenever a release or milestone patch is prepared:

1. [ ] **Verify Production Build:** Run `npm run build` and ensure exit code 0 with zero bundle/Vite errors.
2. [ ] **Bump Version in `package.json`:** Update `"version": "X.Y.Za"`.
3. [ ] **Update `README.md` Badge:** Update the version badge URL in `README.md`.
4. [ ] **Log in `RELEASE_MANAGEMENT.md`:** Document the changes under the Changelog section below.
5. [ ] **Git Commit:** Commit changes with message `chore(release): bump version to vX.Y.Za`.
6. [ ] **Create Annotated Git Tag:** `git tag -a vX.Y.Za -m "Release vX.Y.Za - <Summary>"`.
7. [ ] **Push to Remote:** Push commit and tags: `git push origin main && git push origin --tags`.

---

## 📜 Release Changelog

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
