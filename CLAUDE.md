# MusicMood: notes for Claude sessions

Mood-driven music discovery web app (React 19 + Vite, Node `server.js` on Render, Supabase).
Goal: finish hardening, then ship an Android app on Google Play.

## Where things stand (Nov 22, 2026)

- Current release: see `package.json` (`0.8.8b` at the time of writing). Full history in `RELEASE_MANAGEMENT.md`.
- `ROADMAP.md` is the plan: Phases 0–3 (security & stability) are done; remaining owner tasks are
  listed under "Before Android: open owner tasks"; **next is Phase 4: Android migration**.
- Google OAuth app is **published** (sign-in uses basic scopes only; `youtube.readonly` is requested
  separately for playlist import and shows Google's "unverified app" screen until verified).

## Release process (follow it for every change that reaches `main`)

- Versions stay within `0.8.x` until the owner authorizes `1.0`. Use letter releases for fixes
  (`0.8.8a`, `0.8.8b`, …) and bump the patch (`0.8.9`) for milestone/feature releases when asked.
- For each release: bump `package.json` + `package-lock.json`, the README version badge, add a
  changelog entry at the top of `RELEASE_MANAGEMENT.md`, add a milestone line in `ROADMAP.md`.
- Work on a `claude/<topic>` branch, then fast-forward `main` (`git push origin HEAD:main`).
  The owner has approved Claude pushing to `main`.
- **Tags/releases are automatic**: `.github/workflows/auto-release.yml` tags the version-bump commit
  and publishes the GitHub Release when the version reaches `main`. Cloud sessions cannot push tags.
- Render deploys `main`. The owner's local copy (`C:\Visual studio\MusicMood`) does NOT update itself:
  tell them to `git pull origin main` (and `npm run build` if they use `npm start`).

## Checks before shipping

- `npm test` (Node test runner, `tests/*.test.mjs`), `npm run build`, `npx eslint src`
  (73 pre-existing problems; don't add new ones).
- Database changes: test in a rolled-back transaction first, then apply as a migration and save the
  file in `supabase/migrations/` with the applied version as its timestamp.
- `supabase/tests/permissions.sql`: 25 rolled-back permission checks; must stay all-PASS.

## Supabase (project `wgrucrcdcpgvnxduftow`)

- Identity = Supabase Auth only (`auth.uid()` = `user_profiles.id`). Google users and anonymous guests.
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
- Onboarding (`OnboardingWizard.jsx`) is two steps: radar + "Never play" chips, then mood homes.

## Owner preferences

- Public contact address: `corneliunitoi87@gmail.com` (keep the owner's main address out of the app).
- Plain-language explanations; recommend one option rather than listing many.
- Free Supabase plan (no dashboard backups): for risky DB changes, capture a rollback script
  (see `supabase/rollbacks/`).
- Known environment limits for cloud sessions: no access to `onrender.com`, no tag pushes,
  no Remote Control folder access (so the owner pulls locally).
