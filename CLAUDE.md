# MusicMood: notes for Claude sessions

Mood-driven music discovery web app (React 19 + Vite, Node `server.js` on Render, Supabase).
Goal: finish hardening, then ship an Android app on Google Play.

## Where things stand (Nov 22, 2026)

- Current release: see `package.json` (`0.9.0i` at the time of writing). Full history in `RELEASE_MANAGEMENT.md`.
- `ROADMAP.md` is the plan: Phases 0–3 (security & stability) are done; **Phase 4 (Android, Capacitor) is in
  progress**. The custom-domain switch plan is in `ROADMAP.md` and must happen before the first Play release.
- Google OAuth app is **published** (sign-in uses basic scopes only; `youtube.readonly` is requested
  separately for playlist import and shows Google's "unverified app" screen until verified).

## Release process (follow it for every change that reaches `main`)

- Versions stay within `0.9.x` until the owner authorizes `1.0` (the owner moved the series from `0.8.x` to `0.9.0b` on Nov 23, 2026).
  Use letter releases for fixes (`0.9.0b`, `0.9.0c`, …) and bump the patch (`0.9.1`) for milestone/feature releases when asked.
- For each release: bump `package.json` + `package-lock.json`, the README version badge, add a
  changelog entry at the top of `RELEASE_MANAGEMENT.md`, add a milestone line in `ROADMAP.md`.
- Work on a `claude/<topic>` branch, then fast-forward `main` (`git push origin HEAD:main`).
  The owner has approved Claude pushing to `main`.
- **Tags/releases are automatic**: `.github/workflows/auto-release.yml` tags the version-bump commit
  and publishes the GitHub Release when the version reaches `main`. Cloud sessions cannot push tags.
- Changelog entries start with a platform label: **[Web]**, **[Android]** or **[Web + Android]**.
- **Web + Android model** (details in `RELEASE_MANAGEMENT.md`): one `main`, one version. The website ships every
  version; an Android release is built from an already-tagged version when the owner decides, and is
  recorded in the Android release log. No long-lived platform branches.
- **Backward compatibility:** installed app versions keep calling the database and `server.js` for months.
  Database/API changes must be additive; rename or remove only when no supported app version uses it.
- Render deploys `main`. The owner's local copy (`C:\Visual studio\MusicMood`) does NOT update itself:
  tell them to `git pull origin main` (and `npm run build` if they use `npm start`).

## Checks before shipping

- `npm test` (Node test runner, `tests/*.test.mjs`), `npm run build`, `npx eslint src`
  (73 pre-existing problems; don't add new ones).
- Database changes: test in a rolled-back transaction first, then apply as a migration and save the
  file in `supabase/migrations/` with the applied version as its timestamp.
- `supabase/tests/permissions.sql`: 25 rolled-back permission checks; must stay all-PASS.
- Android (when touched): follow **`ANDROID_BUILD.md`**. In a cloud session: `npm run android:setup` once
  (installs the SDK; needs the "musicmood" environment, which allows Google's and Gradle's download hosts),
  then `npm run android:apk`. Output: `android/app/build/outputs/apk/debug/MusicMood-<version>-debug.apk`.

## Supabase (project `wgrucrcdcpgvnxduftow`)

- Identity = Supabase Auth only (`auth.uid()` = `user_profiles.id`). Google users and anonymous guests.
  **Authentication → Sign In / Providers → "Allow anonymous sign-ins" must stay ON**: when it is off, "Continue as Guest" fails
  with `anonymous_provider_disabled` (422 on `/signup`; shown in the app as "Guest access is temporarily unavailable").
  Roles live in `user_profiles` and are protected by `trg_protect_profile_privileges`.
- Catalog tables (`tracks`, `artists`, `local_metadata`, …): signed-in users may add rows and fill a
  missing `youtube_video_id`; edits/deletes are admin-only (`is_admin()`) or service role.
- Votes: one per user per track (`user_upvotes`); guest weight 0.25, Google users 1.0; max 100
  influencing actions per 30 minutes. Weighted totals in `upvote_score`; `upvotes` is the rounded value.
- `listening_history`: one row per play, updated with the outcome (seconds, completed/skipped/liked/disliked).
- `artists.track_count` is recomputed by trigger on every write; never write summed counts.
- Scripts and GitHub workflows write with `SUPABASE_SERVICE_ROLE_KEY` (repo secret; also needed in the
  owner's local `.env`). Never put it in a `VITE_` variable.
- `supabase/legacy/` holds old SQL that does not match production; don't run it.

## Code map

- `src/services/sessionStateMachine.js`: playback engine. Recency rules: `TRACK_MEMORY` 50,
  `ARTIST_COOLDOWN` 15 (relaxed 5), `LAST_RESORT_MEMORY` 10; dislikes hide an artist for the session;
  genre stays locked until a mood change or Surprise Me.
- `src/services/tasteGraph.js`: 115-genre graph; `MOOD_GENRE_MAP`, `MOOD_DEFAULT_HOME`, `MOOD_ALIASES`
  (single source of mood → genre). 22 visible moods; 8 retired ids redirect.
- `src/services/auth.js`: Supabase sign-in (Google OAuth redirect, anonymous guests, `linkIdentity`).
- `server/youtubeResolver.js`: shared YouTube lookup used by `server.js` (production, requires sign-in,
  rate-limited) and `vite.config.js` (local dev).
- Mood skins: `src/services/moodSkins.js` (looks + rules), `MoodBackdrop.jsx`, `LookSettings.jsx`;
  the Look setting lives in `user_profiles.look` via `get_my_look` / `save_my_look` (`lookService.js`).
- Domain: `https://musicmood.co.uk`, live through Cloudflare (proxy on, SSL Full (strict)). Render settings: `CANONICAL_HOST` redirects
  `*.onrender.com` pages to it (never `/api/`); `TRUST_CLOUDFLARE=1` reads `CF-Connecting-IP` for rate limits.
- Android: Capacitor 8 shell in `android/` (app id `uk.co.musicmood`, final); version read from `package.json` in `android/app/build.gradle`. `apiFetch` prefixes `/api` with
  `VITE_API_BASE_URL` (`.env.android`); `server.js` allows the app origin via `APP_ORIGINS`.
  App-only behaviour is gated with `Capacitor.isNativePlatform()`.
  Native Google sign-in: `nativeGoogleSignIn.js` + `auth.js` (Credential Manager → `signInWithIdToken`; needs `VITE_GOOGLE_WEB_CLIENT_ID`).
  Builds are signed with the upload key from env vars (`ANDROID_KEYSTORE_*`); the manual workflow `android-build.yml` uses repo secrets
  (list in `ANDROID_BUILD.md`). Each signing key needs its own Android OAuth client; add the Play App Signing SHA-1 before the first Play release.
- Player: the YouTube player is visible inside a retro TV (min 268×201; YouTube requires ≥200×200, visible,
  nothing on top). Never hide, shrink or cover it.
- Onboarding (`OnboardingWizard.jsx`) is two steps: radar + "Never play" chips, then mood homes.

## Owner preferences

- Public contact address: `corneliunitoi87@gmail.com` (keep the owner's main address out of the app).
- Plain-language explanations; recommend one option rather than listing many.
- Free Supabase plan (no dashboard backups): for risky DB changes, capture a rollback script
  (see `supabase/rollbacks/`).
- Known environment limits for cloud sessions: no access to `onrender.com`, no tag pushes,
  no Remote Control folder access (so the owner pulls locally).
