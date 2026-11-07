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
