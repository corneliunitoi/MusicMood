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
6. [ ] **Push to `main`:** `git push origin main`. The `Auto-Tag & Release on Version Bump` workflow (`.github/workflows/auto-release.yml`) then creates the annotated `vX.Y.Za` tag on the version-bump commit and publishes the GitHub Release from this changelog.
7. [ ] **Manual fallback:** if the workflow is unavailable, run `npm run tag-release vX.Y.Za` and `git push origin vX.Y.Za`.
8. [ ] **Platform label:** start each changelog entry's first bullet with **[Web]**, **[Android]** or **[Web + Android]** (who sees the change). Labels are for readers only; every build contains all of `main`.

---

## 📱 Web + Android Release Model (since v0.8.8e)

One codebase, one `main` branch, one version number, two release speeds.

* **Branches:** work on short `claude/<topic>` branches, fast-forward `main`. No long-lived platform branches.
* **Web = continuous:** every version that reaches `main` is tagged automatically and deployed by Render within minutes.
* **Android = release trains:** an app release is a *decision*, not a new version. Pick an already-tagged version and build the app from exactly that tag. It contains everything on `main` up to that tag. The app's version comes from `package.json`; the Play `versionCode` is derived automatically (`0.8.8e` → 80805, `0.8.9` → 80900, `1.0.0` → 1000000) and only ever increases.
* **Play Store stages:** internal testing → closed testing (new personal accounts: 12 testers for 14 days before the first production release) → production with a staged rollout (e.g. 10% → 50% → 100%), which can be paused.
* **Backward compatibility (the key rule):** older app versions stay installed for months and keep calling the database and `server.js`. Database and API changes must be additive: add columns, functions and endpoints; rename or remove them only once no supported app version uses them. Removing something needs a note in the changelog saying which app versions it breaks.
* **Before the first public Android release:** a minimum-supported-version check ("Please update") and an automated, signed Android build workflow attached to the auto-release.

### Android release log

| App version (tag) | Track | Date | Notes |
| :--- | :--- | :--- | :--- |
| — | — | — | No Play Store release yet; debug test builds only. |

---

> [!IMPORTANT]
> **VERSION CEILING LOCK (now v0.9.x; the owner authorized the move from 0.8.x on 2026-11-23):**
> Do **NOT** bump the project version past `0.9.x` (e.g., do not increment to `1.0.0`) until explicitly authorized by the project owner. The entire `v0.8.x` release series is strictly reserved for **stability, reliability, performance hardening, and bug fixes**. Any incremental updates must follow patch/minor notation within `0.8.x` (e.g. `0.8.0a`, `0.8.0b`, `0.8.1`, etc.).

---

## 📜 Release Changelog

### `v0.9.0i` — 2026-11-23
* **[Android]** Guard against a wrong Google ID: the signed-build workflow and the app now refuse a `GOOGLE_WEB_CLIENT_ID` that is not a Web client ID (must end in `.apps.googleusercontent.com`), after a client *secret* was pasted by mistake and made Google sign-in fail with "[16] Account reauth failed". The app shows a clear message instead.

### `v0.9.0h` — 2026-11-23
* **[Android]** *Android signed build*: the downloadable zip is now named with the app version (`musicmood-android-signed-0.9.0h`); the APK and AAB inside already carried it.

### `v0.9.0g` — 2026-11-23
* **[Android]** *Android signed build* workflow: a missing secret now names the exact secret to add (`ANDROID_KEYSTORE_BASE64`, …) instead of the internal variable name, and the short names (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) are accepted as well.

### `v0.9.0f` — 2026-11-23
* **[Android]** New app icon, "Midnight" cut gem: a faceted indigo gem with a pearl music note, drawn inside Android's safe circle so round and squircle masks never crop it. Adaptive icon (background + foreground layers), legacy and round icons for all densities, and the 512 px Play Store icon (`branding/play-store-icon-512.png`). Sources in `branding/*.svg`; regenerate with `scripts/generateAndroidIcons.mjs`.

### `v0.9.0e` — 2026-11-23
* **[Web + Android]** New manual GitHub workflow *Add phonk tracks* runs `scripts/addPhonkTracks.js` with the repository's service key (dry run unless "apply" is ticked), because tracks without a YouTube id never play and YouTube is only reachable from there. Rows are tagged `source = 'phonk_seed'`. No inflation: only the listed songs are added.

### `v0.9.0d` — 2026-11-23
* **[Web + Android]** Phonk starter list grown to 14 tracks (Kordhell, PlayaPhonk and others, plus the owner's YouTube example). `npm run add:phonk` now also accepts a bare YouTube video id and reads the title and artist from the video. Still no new genre (`trap_modern`); dry run unless `-- --apply`.

### `v0.9.0c` — 2026-11-23
* **[Web + Android]** Phonk tracks, with no new genre: `npm run add:phonk` looks up each song's real YouTube video, checks the title matches, skips tracks already in the catalog and files the rest under the existing `trap_modern` genre (so they play in Energetic, Party and Dark Intense). Dry run by default; `-- --apply` writes (needs `SUPABASE_SERVICE_ROLE_KEY`). Starts with *No Batidão (Montagem Tomada Funk)* and eight well-known phonk tracks; add more in `scripts/addPhonkTracks.js`.

### `v0.9.0b` — 2026-11-23
* **[Web + Android]** Guest access: "Continue as Guest" was failing for everyone with `anonymous_provider_disabled` because Supabase's *Allow anonymous sign-ins* project setting was off (0 guest accounts existed). The setting must be ON (Authentication → Sign In / Providers); this is now documented in `CLAUDE.md`. No app or database change: guests already get their own account, a private favourites store, vote weight 0.25 and a 100-actions-per-30-minutes cap, and upgrade to Google without losing data.
* Version series moved from 0.8.x to 0.9.x at the owner's request.

### `v0.8.9` — 2026-11-22
* **[Android]** Native Google sign-in: Credential Manager account chooser + `supabase.auth.signInWithIdToken` (guests are upgraded with `linkIdentity`, keeping favourites). Needs `VITE_GOOGLE_WEB_CLIENT_ID` and an Android OAuth client (package `uk.co.musicmood` + signing SHA-1). Unused plugin providers (Facebook, Apple, Twitter) are switched off.
* **[Android]** Signed builds: Gradle signs debug and release builds with the upload key from environment variables; release builds refuse to run without it. New manual workflow *Android signed build* (secrets listed in `ANDROID_BUILD.md`) produces the signed APK and AAB and checks the key's SHA-1.
* **[Web]** No change (all new code runs only inside the Android app).

### `v0.8.8j` — 2026-11-22
* **[Android] Build guide and one-command builds:** new `ANDROID_BUILD.md` (Linux/cloud quick start, Windows with Android Studio, installing test builds, emulator troubleshooting). `npm run android:setup` (`scripts/setup-android-sdk.sh`) installs the Android SDK, writes `android/local.properties` and creates `.env.android`; `npm run android:apk` builds the test app. Tested from an empty SDK folder. No app changes.

### `v0.8.8i` — 2026-11-22
* **[Web + Android] Documentation only, no app changes:** the roadmap's completed-milestones list is back in release order and now includes v0.8.8a and v0.8.8b; `CLAUDE.md` shows the current release.

### `v0.8.8h` — 2026-11-22
* **[Web + Android] Live on `https://musicmood.co.uk`:** the site runs on the custom domain through Cloudflare (proxy on, SSL Full (strict)); `www` forwards to the main address, and the old `musicmood-ghx2.onrender.com` address forwards pages to the domain (`CANONICAL_HOST`; API calls are not redirected). Rate limits use Cloudflare's visitor address (`TRUST_CLOUDFLARE=1`). Supabase and Google sign-in settings include the domain; the onrender entries stay for a few weeks.
* **[Android] Test builds call `https://musicmood.co.uk`** for track lookups.

### `v0.8.8g` — 2026-11-22
* **[Web + Android] Ready for `musicmood.co.uk`:** two new Render settings, both off until the domain serves the site:
  * `CANONICAL_HOST=musicmood.co.uk` redirects visits to the old `*.onrender.com` address to the domain (pages only; `/api/` calls are never redirected, so installed app versions keep working).
  * `TRUST_CLOUDFLARE=1` makes the server's rate limits use Cloudflare's `CF-Connecting-IP` header (visitors cannot fake it) instead of the first `X-Forwarded-For` entry.
* **[Android] Final app id `uk.co.musicmood`** (was the placeholder `com.musicmood.app`). It installs as a new app: uninstall the old test app. `.env.android.example` now points at `https://musicmood.co.uk`.
* The Last.fm importer identifies itself with the new domain.

### `v0.8.8f` — 2026-11-22
* **[Web + Android] Phones: controls above the TV.** On phones the track info, play/skip/like and progress bar come first and the TV sits underneath, so the controls stay near the top. Desktop keeps the TV beside the controls.
* **[Web] Fresh pages after every deploy:** `server.js` now sends caching rules. Pages (`index.html`, the privacy and terms pages) are re-checked on every visit, so a new release shows up at once instead of a stale copy. Vite's hashed files in `/assets/` are kept for a year, which also makes repeat visits faster.

### `v0.8.8e` — 2026-11-22
* **[Web + Android] Visible player in a retro TV:** the YouTube player is no longer a hidden 1×1 frame. It plays on a 268×201 TV screen (YouTube requires a visible player of at least 200×200), with a faded bezel, speaker, mood-coloured power light and knobs around and below the screen, never on top. Two columns on desktop, stacked on phones. The cover shows behind the player while it loads.
* **[Web + Android] Phone layout:** the player fits one phone screen (one-line header; the Active Node label, mood name and energy readout are hidden on phones), smaller phone headline (the old 480px rules were overridden by the later 768px block), and picking a mood on a phone scrolls to the player. The guided tour card docks to the bottom on phones so it no longer covers what it describes.
* **[Android] Android app (Capacitor 8) — Phase 4 starts:** `android/` holds a thin Android shell around the same React app (app id `com.musicmood.app`, a placeholder until the domain is chosen). `npm run build:android` builds it; `/api` calls use `VITE_API_BASE_URL` (see `.env.android.example`). Playback pauses when the app goes to the background (Google Play policy). Debug test builds only; not on the Play Store.
* **[Web] Server:** `server.js` answers CORS requests from the app (`APP_ORIGINS`, default `https://localhost`). No change for website visitors.
* **Release model:** new *Web + Android Release Model* section above (one main branch and version, Android release trains, Play stages, backward-compatibility rule, Android release log).

### `v0.8.8d` — 2026-11-22
* **Look setting saved to your profile:**
  * The Look setting (mood skins: *Match my mood* with switched-off looks, or one locked look) is now stored in `user_profiles.look`, so it follows the listener across browsers and devices, and will carry over to the Android app. Guests keep theirs when they sign in with Google (same account).
  * New database functions `get_my_look()` and `save_my_look(p_look)`: signed-in users and guests only, always acting on the caller's own profile; the input is validated and unknown fields are dropped. No-session visitors are refused.
  * The browser copy stays for an instant first paint; the profile copy wins once loaded. A listener with a browser-only setting from v0.8.8c has it uploaded on their next visit.
  * Migration `20261122074222_look_setting` (rollback script in `supabase/rollbacks/`). Permission test: 25 checks (3 new), all passing against the live database.

### `v0.8.8c` — 2026-11-22
* **Mood Skins (subtle per-mood look):**
  * **🎨 Nine moods tint the app:** Happy (Golden Hour), Sad (Blue Hour), Chill (Tide), Energetic (Ember), Focus (Ink), Party (Afterglow), Rainy Day (Rain Glass), Romantic (Velvet) and Cyberpunk (Neon Grid) each change the background tint, the accent colour (selected mood chip and tab, play button) and add a faint moving background (floating light, mist, rain, a neon grid, …). Layout, fonts and shapes never change, and colours fade over about 1.4 seconds.
  * **Other moods keep the current look:** picking Late Night, Epic, Dark Academia and the other 10 moods leaves the look as it is. Retired moods follow their replacement (e.g. Workout → Ember).
  * **🎛️ Settings › Look (new header button):** *Match my mood* (default) with a switch per look; a switched-off look falls back to Classic, the original look. Or *Always use one look* to lock any look, Classic included, for every mood. Saved in the browser (`musicMood_look`).
  * Respects reduced-motion settings (no animation, no fades). New `src/services/moodSkins.js`, `MoodBackdrop.jsx`, `LookSettings.jsx`; 5 new unit tests (31 total).

### `v0.8.8b` — 2026-11-21
* **Simpler Two-Step Onboarding:**
  * **Step 1 — Shape your sound:** the 6-point Sonic Radar, now with a **"Never play"** row underneath: the dealbreaker chips plus an **🤖 AI-generated music** chip (replaces the separate Anti-AI toggle; still on by default).
  * **Step 2 — Your mood homes:** the predicted Home genre for each core mood, introduced as *"This is our automatic selection… Happy with it? Just press Start Listening. Want to fine-tune? Tap any genre."*
  * **Removed the "Emotional Reflexes" screen:** "Lean into it / Lift my spirits" barely affected recommendations ("lift" did nothing) and is already expressed by choosing the Sad or Happy mood; "Deep Focus: instrumental" duplicated the Focus mood's built-in instrumental mode and the player's vocal toggle. Existing calibrations keep their saved values.

### `v0.8.8a` — 2026-11-21
* **Privacy Policy & Terms of Service pages:**
  * Added `/privacy.html` and `/terms.html`, describing what the app actually collects (Google profile basics, anonymous guest ids, listening history, favorites, votes, calibration, feedback, optional YouTube playlist access), where it is stored (Supabase EU West, Render, Google/YouTube), and how to request export or deletion.
  * Linked from the sign-in screen. Required for publishing the Google OAuth app and, later, for the Play Store.

### `v0.8.8` — 2026-11-21
* **Security & Stability Milestone (completes the `v0.8.7a`–`v0.8.7h` hardening series) plus Phase 3 clean-up:**
  * **🔐 Sign-in no longer needs Google verification:** Google sign-in now asks only for basic profile scopes (name, email, picture). YouTube access (`youtube.readonly`, a sensitive scope that requires Google app verification) is requested separately, only when a listener imports their YouTube playlists ("Connect YouTube" / "Grant YouTube Permission & Load"). Once the Google OAuth app is published, anyone can sign in; previously only listed test users could.
  * **🎚️ Artist track counts are exact:** 695 artists showed wrong counts (e.g. Pink Floyd 1,064 vs 152 real tracks, Nine Inch Nails 1,456 vs 208) because the duplicate-merge job summed stored counts on every run. All counts were recounted, `artists.track_count` is now derived from the tracks table by the database on every write (`trg_enforce_artist_track_count`), and `mergeDuplicateArtists.js` merges weighted vote scores instead of summing counts. No duplicate tracks existed; only the displayed number was wrong.
  * **🧩 One YouTube resolver:** the playlist scraper and track resolver lived twice (`server.js` and `vite.config.js`, ~400 identical lines). Both now import `server/youtubeResolver.js` (server.js 734 → 266 lines, vite.config.js 545 → 65 lines), and the dev server applies the same input validation as production.
  * **🐛 Title clean-up:** decorations like "(Official Audio)", "(Lyric Video)" and "(Visualizer)" were left in resolved titles; they are now stripped.
  * **📦 Admin tool code-split:** the JIT monitor (admin/poweruser only) is loaded on demand instead of shipping to every listener.
  * **🗂️ Schema housekeeping:** the stale root SQL files (`schema_v2.sql`, `setup_taste_graph.sql`, `add_youtube_id.sql`) moved to `supabase/legacy/` with a note; `supabase/migrations/` is the source of truth. `local_metadata` uses only `youtube_video_id` (confirmed in the live database).
  * **🧪 Tests & CI:** 26 unit tests (resolver title parsing added), plus `supabase/tests/permissions.sql`: 22 rolled-back permission checks for guest, admin and no-session roles, all passing against the live database. New `Database permissions` workflow runs it weekly and on schema changes once the `SUPABASE_DB_URL` secret is set.
  * **✉️ Contact:** the public contact address in the About dialog changed.

### `v0.8.7h` — 2026-11-21
* **Stability — One Mood Vocabulary (22 visible moods):**
  * **🎛️ Single source of truth:** `MOOD_GENRE_MAP` in `tasteGraph.js` now defines every mood's compatible genres, with new `MOOD_DEFAULT_HOME` (curated fallback home per mood) and `MOOD_ALIASES` (redirects for retired moods). `moods.js` holds only labels, emoji and UI categories.
  * **🧹 Mood line-up (approved Nov 21):** the 6 core moods plus 16 others stay visible. Merged into near-duplicates: Workout → Energetic, Study → Focus, Melancholic → Sad, Villain Mode → Dark/Intense, Soft Vibes → Chill, Ambient → Wind Down. Hidden: Hopeful and Main Character (→ Happy). Retired ids keep working everywhere: saved sessions, pinned homes and listening history redirect to the replacement mood.
  * **🔧 Fixed 7 dead genre ids** in mood mappings (`motown`, `90s_alt`, `rnb_contemporary`, `dream_pop`, `fingerstyle`, `acoustic_guitar`, `space_rock`) that silently shrank those moods.
  * **🏠 Curated default homes** for every mood (e.g. Late Night → Cool Jazz, Roadtrip → Classic Rock, Epic → Cinematic Orchestral), used before a listener calibrates their taste profile. Calibrated listeners keep their predicted or pinned homes.
  * **📊 Catalog check:** every genre of every mood has playable tracks; the smallest default home has 169 and the smallest mood 1,274 playable tracks.
  * **🧪 Tests:** 8 new tests (19 total) guard the vocabulary: no unknown genres, every visible mood mapped with a default home inside its own genres, every retired mood redirecting to a visible one.

### `v0.8.7g` — 2026-11-21
* **Stability — Session State Machine Consistency & First Test Suite:**
  * **🔁 One set of anti-repetition rules for every sourcing path** (catalog pull, emergency fallback, JIT discovery, strict guards), defined once in `sessionStateMachine.js`:
    * a track never repeats within the last **50** plays (`TRACK_MEMORY`);
    * an artist does not return within **15** plays (`ARTIST_COOLDOWN`), or **5** in the explicit relaxed fallback (`ARTIST_COOLDOWN_RELAXED`);
    * even the last-resort pass never replays one of the last **10** tracks (`LAST_RESORT_MEMORY`). Previously it could replay any track except the current one, and the paths used 15 / 10 / 5 / none for artists.
  * **👎 Dislikes last the whole session:** a disliked artist is hidden until the session is reset (previously only for 15 tracks), as the README promised.
  * **⏳ "Busy" is no longer "nothing to play":** concurrent `getNextTrack()` calls share the in-flight lookup instead of receiving `null`, which could surface as "No guard-checked track available".
  * **📏 Bounded memory:** recent-track and recent-artist lists are trimmed as they grow, not only when saved.
  * **🧹 Removed dead code:** the unused `stepToNextGenre()` traversal (whose discovery tiers ignored hop limits) and the unused 2-track dwell cap. Genre lock is the intended behaviour: playback stays in the chosen genre until a mood change or *Surprise Me* (which already enforces the 1-hop / 2-hop / unrestricted discovery tiers).
  * **🧪 First automated tests** (`npm test`, Node's built-in runner): recency rules, dislike persistence, concurrent `getNextTrack`, and genre-graph integrity (11 tests).
  * **⚙️ CI:** new `CI (tests & build)` workflow runs the tests and the production build on pushes to `main` and `claude/**` branches.
  * **📖 README** now describes the actual recency rules and genre lock (the "2-Track Dwell Cap" claim was removed).

### `v0.8.7f` — 2026-11-21
* **Stability — Listening History You Can Analyze:**
  * **🎵 One row per play:** a `listening_history` row is created when a track starts and **updated** with its outcome, instead of separate rows for start, skip, completion and like. Rows now map 1:1 to plays, so skip rates, completion rates and genre/mood transitions can be computed directly.
  * **⏱️ Listening time recorded:** `listened_seconds` comes from the YouTube player (it was 0 in all 6,810 earlier rows). Time is also saved when the tab is hidden or closed.
  * **🏷️ New outcome columns:** `disliked` (no longer indistinguishable from a skip), `ended_at`, and `youtube_video_id`, so plays of tracks without a catalog id are still identifiable.
  * **🐛 Plays in 22 of 30 moods were silently lost:** only 8 moods existed in the `moods` table, so plays in Sad, Party and 20 other moods were rejected. All 30 app moods are now registered (behaviour of the 24 non-core moods is still to be designed).
  * **🧮 Affinity from outcomes:** artist affinity reacts to the recorded outcome (like +5, complete +2, skip −2, dislike −3), with the guest 0.25 weight and the 100-per-30-minutes cap. Users can update only the outcome fields of their own plays.
  * **📊 For analysis:** rows created from this release on follow the one-row-per-play format; earlier rows use the old multi-row format.
  * **⚙️ CI:** "Hourly Catalog Sanity" no longer times out (duplicate merge step removed, avatar step capped at 6 minutes / 120 artists and non-fatal, job limit 30 minutes).

### `v0.8.7e` — 2026-11-21
* **Security Hardening — Phase 2c (Server Endpoints):**
  * **🔑 Sign-in required:** `/api/resolve-track` and `/api/playlist-tracks` now require a Supabase access token (Google users and guests alike). The server verifies it with Supabase and caches the result for 5 minutes. The app sends it automatically via the new `apiFetch()` helper. Previously anyone on the internet could use the server as a free YouTube scraping proxy.
  * **⏱️ Rate limits** (per minute): track lookups 60 per user / 120 per IP; playlist imports 10 per user / 20 per IP. Excess requests get `429` with `Retry-After`.
  * **🧱 Input validation:** artist/title capped at 300 characters; playlist ids must match `[A-Za-z0-9_-]{2,64}` (previously passed straight into YouTube URLs); only `GET` is accepted on `/api/*`; unknown API paths return `404`.
  * **🙈 No internal error leaks:** server errors are logged and replaced with generic messages (YouTube's own "private/missing playlist" messages are still shown).
  * **🛡️ Security headers on every response:** HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and a Content Security Policy in **report-only** mode (logs violations in the browser console without blocking; to be enforced once confirmed clean on the live site).

### `v0.8.7d` — 2026-11-21
* **Security Hardening — Phase 2b (User-Scoped RPCs, Fair Voting & Rate Limits):**
  * **🗳️ One vote per listener per track** (`public.user_upvotes`): repeated upvotes on the same track are ignored, and the vote size sent by the client is ignored, so a single account can no longer inflate a track (it previously accepted any delta, e.g. 1,000,000).
  * **⚖️ Guest weighting:** anonymous guests' upvotes, favorites and listening-history likes count **0.25**; Google users count **1.0**. Precise weighted totals live in the new `tracks.upvote_score` / `artists.upvote_score` columns (seeded from existing counts); `upvotes` stays as their rounded value for existing readers.
  * **⏱️ Rate limits:** at most **100** upvotes per 30 minutes per account (the player shows a message when reached). Favorites and history likes still save beyond that, but only the first 100 in 30 minutes move track/artist scores.
  * **🐛 Favorites were counted twice:** the favorites trigger and an extra client upvote both bumped popularity. Only the (weighted) trigger counts now.
  * **🔐 User data RPCs act only on the signed-in user:** `get_user_favorites`, `sync_user_favorites`, `remove_user_favorite`, `get_user_calibration` and `sync_user_calibration` ignore the client-supplied user id and use `auth.uid()`. Previously anyone could read or write another user's favorites and calibration.
  * **🧹 Removed** the legacy `resolve_or_create_user` (both overloads) and `resolve_or_create_test_user`, which let anyone claim the admin profile by email. Script-only RPCs (`get_dynamic_priority_inflation_candidates`, `get_random_unmapped_local_tracks`) are restricted to the service role; visitors without a session can no longer read per-user tables.
  * Verified with rolled-back tests on the live database: one vote per track, 0.25 guest weight, rate limit at 100, user scoping, no-session access blocked, existing favorites intact.

### `v0.8.7c` — 2026-11-21
* **Security Hardening — Phase 2a (Catalog Lockdown):**
  * **🗄️ Row Level Security (`supabase/migrations/20261121201808_catalog_lockdown.sql`):**
    * Signed-in users and guests can **add** to the catalog (tracks, artists, archive rows) and fill in a **missing** YouTube video id, but can no longer edit or delete existing catalog rows.
    * Deleting tracks and moderating artist suggestions, genre flags and playback reports is admin-only (`is_admin()`).
    * Users can request artists (new requests, or `request_staged_artist` for staged ones) and manage only their own genre flags.
    * Visitors without a session can read the catalog and send feedback, nothing else. Closed anonymous read/write access to everyone's listening history.
  * **🎧 No more client-side deletions:**
    * A YouTube playback error no longer deletes the track for everyone (errors like 150 are often region- or device-specific). The app files a report in the new `track_playback_reports` table instead.
    * Disliking a JIT-discovered track only steers the current session; it no longer removes the track from the catalog.
    * Dismissing a staged artist only hides it for that listener; rejecting for everyone is admin-only.
    * Removed client writes to `artists.track_count` (kept by trigger) and `artists.avatar_url` (kept by the scheduled avatar job).
  * **⚙️ Scripts & workflows:** all catalog scripts prefer `SUPABASE_SERVICE_ROLE_KEY`; scheduled workflows require the `SUPABASE_SERVICE_ROLE_KEY` repository secret and fail fast without it.
  * Verified with 23 rolled-back permission checks against the live database (guest, admin and no-session roles).

### `v0.8.7b` — 2026-11-21
* **Security Hardening — Phase 1 (Supabase Auth as the Only Identity Source):**
  * **🔐 Sign-in through Supabase Auth:**
    * Google sign-in now uses `supabase.auth.signInWithOAuth` (full-page redirect, YouTube read-only scope). The Google access token for playlist import is the session's `provider_token`, kept in `sessionStorage` with a 55-minute expiry.
    * Guests sign in with `supabase.auth.signInAnonymously`, so every guest device gets its own account. "Sign In with Google" upgrades a guest in place via `linkIdentity`, keeping their favorites.
    * Identity comes from the Supabase session (`auth.uid()`), not from `localStorage`. Removed the hard-coded shared guest id, the Google Identity Services token client, the Google userinfo fetch and the test-persona switcher.
  * **🗄️ Database (live; `supabase/migrations/20261121111958_supabase_auth_profiles.sql`):**
    * Every auth user gets a `user_profiles` row with the same id (`on_auth_user_created_profile` trigger).
    * On a user's first Google sign-in (or a guest→Google link), their pre-Supabase profile is merged in automatically, matched by the verified Google user id: favorites, listening history, dealbreakers, mood/genre affinities, genre flags, feedback, calibration and role (`claim_legacy_profile`).
    * `trg_protect_profile_privileges` blocks clients from changing `role`, `user_class`, `google_id` or `is_guest`.
    * New RPCs: `get_my_profile()` (self-healing) and `is_admin()`.
  * **🐛 Guest favorites never reached the cloud (since `v0.8.5`):** `sync_user_favorites` created fallback profiles with `role = 'guest'`, which `user_profiles_role_check` rejects; since CHECK constraints run before `ON CONFLICT`, every guest sync failed. Fixed (`20261121115021_fix_guest_favorites_sync_role.sql`).
  * **Requires** the Supabase dashboard configuration done on Nov 21: Google provider (client ID + secret), anonymous sign-ins, manual identity linking, Site URL and redirect URLs.
  * **Still open (Phase 2):** catalog tables remain writable by any signed-in user, and the favorites/calibration RPCs still accept a client-supplied user id.

### `v0.8.7a` — 2026-11-20
* **Security Hardening — Phase 0 (Emergency Fixes):**
  * **🗄️ Database privileges (live project, recorded in `supabase/migrations/`):**
    * Revoked `TRUNCATE`, `TRIGGER` and `REFERENCES` from `anon` and `authenticated` on all `public` tables, plus default privileges for new tables. Row Level Security does not apply to `TRUNCATE`, so the publishable key could previously empty any table in one call.
    * Revoked public `EXECUTE` on `resolve_or_create_test_user` (could mint admin profiles), the four trigger functions and the unused `get_priority_inflation_candidates`.
    * Pinned `search_path = public` on the 8 functions flagged by the Supabase security advisor.
    * Revoked API access to the unused `history` and `music_users` tables.
    * Made `public.feedback` insert-only for clients (signed-in users could previously read every comment).
    * Banned the shared `testguest` auth account, whose password was committed to the repository (it had never signed in).
  * **🔑 Secrets & personal data:**
    * Removed the hard-coded Last.fm API key from the client, scripts and workflows. It is now read from `VITE_LASTFM_API_KEY` (client) and `LASTFM_API_KEY` (scripts and the GitHub secret).
    * Removed the guest password fallback from `src/services/supabaseService.js` and deleted `scripts/createGuest.js`.
    * Removed email-based admin detection; roles now come only from `public.user_profiles`.
    * Stopped publishing personal library dumps from `public/` (NAS paths in `exploded_albums_manifest.json`); scanner output now goes to the gitignored `scripts/cache/`.
  * **⚙️ CI & dependencies:**
    * GitHub workflows pass `workflow_dispatch` inputs through `env:` instead of interpolating them into shell scripts (shell-injection fix).
    * `npm audit fix`: resolved the high-severity `music-metadata` and moderate `file-type` advisories (0 vulnerabilities).
  * **🗺️ Roadmap:** Reprioritized `ROADMAP.md` on security and stability (Phases 0–3) before the Android migration; all feature work is frozen.
  * **Unchanged by design:** guest upvotes and favorites keep working (verified as the `anon` role). Guest favorites already use per-device IDs (since `v0.8.5`); listening history and calibration still use the shared guest ID until the Supabase Auth migration (Phase 1).

### `v0.8.7` — 2026-11-20
* **Universal Global Search Across Songs & Artists, Scheduled Staged Demo Tracks Resolution, and Authentication Hardening:**
  * **🔍 Discrete Universal Global Search (`GlobalSearchModal.jsx`):**
    * Added a discrete `🔍 Search` button in the top header bar alongside *About* and *Feedback*, automatically collapsing to a sleek `🔍` icon on mobile screens.
    * Integrated global keyboard shortcut: pressing `Ctrl+K` (or `Cmd+K`) anywhere in the app opens/toggles the universal search overlay.
    * Multi-tier search covering all three domains simultaneously:
      * **🎵 Playable Songs (`public.tracks`)**: Real-time matching by title and artist. Clicking any song immediately plays it in the persistent player with zero lag via `sessionEngine.playOnDemand()`.
      * **👤 Catalog Artists (`public.artists`)**: Surfaces admitted catalog artists with genre tags and track counts. Clicking an artist opens Artists Explorer pre-focused on their catalog.
      * **⏳ Staged Candidates (`public.artist_suggestions`)**: Queries 17,500+ uncataloged staging pool artists with one-tap signature demo track audition (`[▶ Demo]`) and staging inspection.
    * Added scope filter tabs (`All`, `🎵 Songs`, `👤 Artists`, `⏳ Staged`) with debounced live search and `Escape` key dismissal.
  * **🎧 Scheduled Staged Artist Demo Tracks Resolution Engine:**
    * Automated signature demo track resolution for uncataloged staged artists across YouTube Music, iTunes, and Last.fm.
    * Created dedicated GitHub Actions workflow `.github/workflows/populate-staged-demos.yml` executing every 2 hours (`15 */2 * * *`) with manual trigger (`workflow_dispatch`) support.
    * Integrated hourly demo population into `.github/workflows/scan-artists-hourly.yml`.
    * Resolved SQL three-valued logic in `scripts/populateStagedDemos.js` via `.or('demo_track_title.is.null,demo_track_title.neq.UNRESOLVED')`, preventing unresolvable candidates from blocking batch advancement.
  * **🔑 Google Authentication Hardening & Guest-to-Admin Session Upgrade:**
    * Configured `requestConfig.prompt = options.prompt !== undefined ? options.prompt : 'select_account'` in `src/services/auth.js` to guarantee the Google OAuth account picker modal appears across mobile and desktop browsers with third-party cookie restrictions.
    * Added 1-click `🔑 Sign In with Google` pill directly in the header when in Guest mode (`GU Guest User`), upgrading sessions directly into **👑 ADMIN • POWERUSER** and hydrating private playlists without requiring manual signout.
    * Added bidirectional token synchronization (`onTokenUpdate`) between `src/App.jsx` and `src/components/Dashboard.jsx`.
    * Implemented CSS safe-area inset top padding (`env(safe-area-inset-top)`) preventing mobile device status bars in landscape orientation from overlapping header navigation actions.
  * **✨ Artists Explorer Search Clean-Up & Fuzzy Matching:**
    * Cleaned redundant dashboard search bar, consolidating search into the unified Artists Explorer with fuzzy typo-tolerant matching (Levenshtein distance) across all canonical genres.

### `v0.8.6a` — 2026-11-20
* **YouTube Playlist Ingestion Fix & On-The-Spot Artist Inflation with Guardrails:**
  * **⚡ Resolved "The playlist does not exist" Ingestion Failure:**
    * Integrated YouTube Music InnerTube Browse (`/youtubei/v1/browse`) as the primary tier-1 zero-quota playlist resolver in both Vite dev server (`vite.config.js`) and production Express (`server.js`).
    * Resolves up to 100 tracks in ~200ms via pure JSON without touching official Google Data API quota or failing on YouTube web HTML structure changes.
    * Fixed silent 401 token expiry in `src/services/youtube.js`: now catches expired Google OAuth tokens explicitly instead of silently falling back to unauthenticated web scrapers on private playlists.
    * Added actionable 1-click `🔑 Reconnect YouTube` action button and pro-tip ("Set playlist to Unlisted on YouTube to ingest directly without auth") in `src/components/PlaylistView.jsx`.
  * **🌱 On-The-Spot Artist Inflation During Playlist Ingestion:**
    * Automated on-the-spot artist inflation in `src/services/youtubePlaylistIngester.js` whenever imported tracks contain artists not yet present in `public.artists`.
    * Implemented strict musical artist guardrails (`isInflateCandidate`) preventing noise/placeholders (`"Unknown Artist"`, `"Various Artists"`, numeric junk, livestreams, reaction videos, interviews, podcasts, compilations, and top charts).
    * Pulls canonical top tracks from iTunes Search API (with Last.fm fallback), capped at 8 canonical songs per new artist to ensure lightning-fast ingestion without delays.
    * Resolves YouTube video IDs via `/api/resolve-track` and persists tracks to `public.tracks` and `public.local_metadata`, automatically updating `public.artists.track_count`.
    * Added live progress updates (`Auto-inflating artist: <name>...`) and a celebratory completion banner highlighting the number of auto-inflated artists and canonical tracks added.

### `v0.8.6` — 2026-11-20
* **Unified Main Search Across Catalog & Staging, Home Dashboard Search Bar & Multi-Genre Pre-Population Seeding:**
  * **🔍 Top-Priority Staged Artist Discovery Across Main Catalog & Staging:**
    * Integrated all **11,896** staged candidates into the main search engine—searchable from the default "All Artists" view and every genre family without needing to toggle the "Potential Matches" tab.
    * Pinned matching staged candidates **prominently at the top of the search grid** (`⏳ Available to Request from Staging`) ahead of catalog matches, ensuring listeners can immediately audition (`[▶ Try]`) and request (`[+ Request]`) uncataloged artists without scrolling past dozens of catalog entries.
    * Added dedicated 3-way search scope toggle pills:
      * `✨ All Matches ({total})`: Combined view with staged candidates prioritized on top.
      * `⏳ Staged Requests ({count})`: Isolated view of pending candidates awaiting admission.
      * `👥 In Catalog ({count})`: Filtered view of admitted catalog artists with verified tracks.
    * Upgraded search query engine to support multi-field search against both canonical name and subgenre taxonomy (`.or(name.ilike.%query%,primary_genre_id.ilike.%query%)`), allowing queries like `"darkwave"`, `"krautrock"`, or `"reggae"` to surface corresponding staged artists.
    * Added live asynchronous loading state (`⏳ Searching 11,896 staged...`) to eliminate premature empty state flashes while querying Supabase.
  * **🏠 Home Dashboard Main Search Bar:**
    * Placed a global quick-search bar directly on the Home Dashboard above the Headspace selection row.
    * Listeners can search any artist across both catalog and staging directly from the landing page. Pressing `Enter` or clicking `Search` opens Artists Explorer pre-filtered with immediate results.
  * **✨ On-Demand Custom Artist Ingestion Request:**
    * When a listener searches for an obscure or unlisted artist not found in catalog or staging, an instant action button appears: `✨ Request "<name>" to be added to catalog`.
    * Submitting the request automatically provisions the artist into `public.artist_suggestions` with `is_requested: true, status: 'approved'`, queuing them at top priority for the next scheduled inflation runner.
  * **🌱 Multi-Genre Top Artists Seeding & Catalog Milestones:**
    * Created `scripts/seedStagedTopArtists.js` (`npm run seed:staged`) to systematically populate staging queues across underrepresented genre families (Darkwave, Krautrock, Shoegaze, Reggae, Celtic, Post-Punk, Power Metal, Thrash Metal, Neo-Jazz).
    * Seeded **+1,389 new canonical artists** with full deduplication against existing catalog and staging tables.
    * Admitted **John Mayall & The Bluesbreakers** to `public.artists` with 25 canonical tracks (*"Hideaway"*, *"All Your Love"*, etc.).
    * Catalog expanded to **96,679 verified tracks** (+457 new tracks inflated via automated GitHub Actions cloud runner).

### `v0.8.5` — 2026-11-20
* **Dynamic Elastic Discography Inflation, Anonymous Guest Cloud Engagement & Comprehensive Mobile Responsive Redesign:**
  * **📈 Dynamic Elastic Discography Inflation Pipeline & Multi-Tier Caps:**
    * Implemented `public.get_dynamic_priority_inflation_candidates` PostgreSQL SECURITY DEFINER RPC with a 4-tier elastic discography cap based on real listener interest:
      * *Tier 4 (100 tracks)*: Super-favorites ($\ge 3$ favorited tracks, $\ge 6$ total engagement score, or $\ge 15$ upvotes).
      * *Tier 3 (75 tracks)*: Strongly engaged ($\ge 2$ favorited tracks, $\ge 4$ total engagement score, or $\ge 8$ upvotes).
      * *Tier 2 (50 tracks)*: Repeated listener interest ($\ge 2$ total engagement, or $\ge 3$ upvotes).
      * *Tier 1 (25 tracks)*: Baseline favorites or single upvote.
      * *Base / Cold Start (10 tracks)*: Default staged candidates strictly capped at 10 tracks to prevent uncontrolled inflation without verified listener demand.
      * *Custom Override*: Supported manual `custom_track_cap` column in `public.artists`.
    * Upgraded inflation scripts (`inflateArtists.js`, `inflateRelatedArtists.js`, `inflateUnderrepresentedFavorites.js`) to consume dynamic caps and automatically supplement iTunes catalog hits with Last.fm AudioScrobbler tracks when iTunes has insufficient entries to fill the deficit.
    * Live verification: **Sonny Rollins** automatically qualified for Tier 4 (100 tracks) and expanded from 57 to 100 verified tracks.
  * **👻 Anonymous Guest Engagement & Real-Time Cloud Sync:**
    * Assigned persistent anonymous client device UUIDs (`musicmood_guest_device_id`) in `localStorage` for all guest listeners.
    * Enhanced `sync_user_favorites` PostgreSQL RPC to auto-provision anonymous guest identities in `public.user_profiles` (`is_guest: true`), enabling guest favorites (❤️) to sync directly into `public.user_favorites` without foreign-key errors.
    * Integrated dual-action engagement: clicking favorite (❤️) now automatically triggers a real-time database upvote (`upvoteTrack`), boosting both track and artist popularity and affinity scores from any visitor.
  * **📱 Comprehensive Mobile & Landscape Responsive Redesign:**
    * Full responsive layout scaling across mobile phones, tablets, and desktop resolutions.
    * Eliminated root flex-centering on `body`, resolving the critical mobile bug where headers, avatars, and action buttons were pushed into negative scroll space.
    * Added universal `box-sizing: border-box` and mobile dynamic viewport units (`min-height: 100dvh`) to prevent address-bar layout shifts and horizontal overflow.
    * Adaptive header navigation: "About", "Feedback", and "Sign Out" collapse to clean icon-first pill buttons on mobile screens, saving $> 150\text{px}$ of horizontal width.
    * Smooth momentum scrolling (`-webkit-overflow-scrolling: touch`) with hidden scrollbars for `.header-nav-pills` and `.mood-category-tabs`.
    * Re-architected Player Card (`.player-main-row`) on mobile into thumb-friendly stacked tiers.
    * Dedicated mobile landscape optimization (`@media (max-height: 560px)`) minimizing vertical margins and hiding auxiliary subtitles so player controls and mood chips stay immediately accessible on screen.
  * **🐛 Bug Fixes & Catalog Expansion:**
    * Fixed silent failure in `src/services/supabaseService.js` on artist request submission (`try...catch` replacing invalid `.catch()` on Postgrest filter builder).
    * Admitted Romanian jazz legend **Anca Parghel** with 25 canonical tracks resolved via iTunes + Last.fm + YouTube InnerTube.
    * Catalog expanded past **96,222 verified tracks (+2,040 tracks added)** across staged approved artists, related artist discovery, and favorite inflation.
    * Updated automated GitHub Actions workflow (`.github/workflows/reconcile-flags.yml`) with automated deduplication and synchronized dynamic limits.

### `v0.8.4a` — 2026-11-13
* **Automated Staged Ingestion Roadmap Architecture (Option C), Strategic Roadmap Sync & Continuous CUE Ingestion:**
  * **⚖️ Option C: Tiered Hybrid Ingestion Architecture (`ROADMAP.md` Item #19):**
    * Documented the multi-factor 4-pillar composite scoring index ($0-100\text{ pts}$):
      * *Library Coherence & Deficit Gap Filling (35%)*: Graph proximity to active anchors + inverse density boost for underrepresented genres ($< 50$ tracks).
      * *Quality & Audio Authenticity (25%)*: MBID verification, non-generic taxonomy, YouTube Music `- Topic` channel match, and verified duration (2:00–8:00).
      * *Popularity & Social Demand (25% - Damped Egalitarian)*: Direct user requests ($\min(20, \text{request\_count} \times 10)$) + logarithmic playcount dampening to prevent mainstream pop monopolization.
      * *AI Gatekeeper & Noise Quarantine (15% + Hard Veto)*: Disqualification for noise tokens (podcast, interview, reaction, karaoke, stems), extreme durations ($< 45\text{s}$ or $> 25\text{m}$), and embed restriction codes (`101`/`150`).
    * Outlined dual execution engine: PostgreSQL view (`public.v_staged_ingestion_priority`) coupled with scheduled background inflation and session-driven real-time JIT buffer replenishment.
  * **🗺️ Strategic Roadmap Milestones & Feature Status Sync (`ROADMAP.md`):**
    * Updated completed status markers for shipped platform features: In-App Master Volume Slider (`v0.8.3`), Web Media Session API (`v0.8.3`), and Decoupled In-App Artist Navigation (`v0.8.4`).
    * Synchronized Completed Milestones historical ledger from `v0.7.8` through `v0.8.4`.
  * **💿 Continuous Lossless CUE Catalog Ingestion:**
    * Autonomous background resolution (`scripts/resolveVideoIds.js --innertube --cue-only`) active, passing 580+ verified lossless album tracks mapped into `public.tracks` and `public.artists`.

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
    * Displays application version `v0.7.7`, author and creator attribution (Corneliu Nițoi / `@corneliunitoi`), contact email (`corneliunitoi87@gmail.com`) with 1-click copy, and repository links.
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
  * Granted `poweruser` tier and `admin` role to the owner account via Supabase RPC `resolve_or_create_user`.
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
