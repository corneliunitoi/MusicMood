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

## 📜 Release Changelog

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
