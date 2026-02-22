# MusicMood - Project Features History

This document outlines the comprehensive history of the features we've implemented in the `MusicMood` project, detailing their technical specifications and core behaviors.

## 1. YouTube OAuth & Integration

**Description:** Integrating the app with the YouTube Data API for user personalization.

* **OAuth 2.0 Flow:** Implemented user authentication using a standard implicit OAuth flow targeting the Google Cloud YouTube Data API v3 (`auth.js`).
* **User Profile Retrieval:** Fetches user details (Name, Avatar) upon successful login and displays them in the mini-profile header.
* **Playlist Synchronization:** Uses `fetchUserPlaylists` to retrieve the active user's existing public/private YouTube playlists, displaying them cleanly in the `PlaylistView.jsx` component.

## 2. Local Library Scanning & Cloud Sync

**Description:** A backend NodeJS pipeline for aggregating and synchronizing a massive local music repository directly to the cloud.

* **Recursive File Scanning:** The script `scripts/scanLibrary.js` traverses local directories recursively (e.g., `M:\Music`) targeting audio files (`.mp3`, `.flac`, `.m4a`, `.wav`, `.ogg`).
* **Primary Extraction:** Reads ID3/Vorbis tags using the `music-metadata` library.
* **Heuristic Fallback:** If ID3 tags are missing or corrupted, a fallback heuristic extracts artist, title, and genre data directly from the parent directory naming conventions (expecting `...\Genre\Artist - Album\Track.ext`).
* **Metadata Enrichment:** Before saving, the pipeline cleans the track names and queries the `iTunes Search API` to fetch canonical artist names and standard genres, drastically improving data integrity.
* **In-Memory Caching:** To prevent hitting rate limits against iTunes, an in-memory map caches Artist-to-Genre lookups during the scan.
* **Supabase Synchronization:** Batches and upserts the scanned and enriched catalog directly into a PostgreSQL Supabase database (`local_metadata` table).
* **Cloud Counter:** The frontend `Dashboard.jsx` polls the exact count of synced tracks dynamically every 30 seconds and renders this stat directly in the UI.

## 3. Genre Normalization & Hierarchical Mapping

**Description:** A system that processes wild and dirty genre tags returned from APIs or ID3 tags into a rigid, consumable taxonomy.

* **Hierarchical Dictionary:** Defined in `musicEngine.js` (`GENRE_HIERARCHY`), containing 10 primary genres (e.g., `Pop`, `Rock`, `Lofi/Chill`, `Electronic/Dance`) and sub-genre keyword mappings.
* **String Normalization:** Cleans incoming genres from the iTunes API and directory scans down to lowercase alphameric blocks.
* **Classification Engine:** Scans normalized genres against the hierarchy and categorizes the track into its corresponding Primary Genre Bucket.

## 4. Taste Profile Analyzer

**Description:** A feature that understands the user's base music preferences using their YouTube footprint.

* **Playlist Deep-Dive:** `TasteAnalyzer.jsx` scans the user's top YouTube playlists, grabbing video titles inside them.
* **On-The-Fly Enrichment:** It passes the fetched video titles through `metadataEnricher.js`, utilizing the `iTunes Search API` to extract canonical genres for the underlying tracks.
* **Taste Calculation:** Aggregates these returned genres and determines the user's `topGenres` (e.g., "70% Lofi/Chill, 30% Rock"). This profile is subsequently cached.

## 5. Mood Engine & Intelligent Discovery

**Description:** The core feature that converts user sentiment into playable audio.

* **Mood Selection:** Provides a visual, interactive `MoodBar.jsx` featuring discrete emotional states (e.g., 🔥 Energetic, 🎵 Chill, 😢 Sad, ❤️ Romantic). Each mood maps to specific search contexts and keywords.
* **Contextual Inference:** `musicEngine.discoverPlaylistForMood` combines the user's requested Mood with their exact `TasteProfile` (Top Genres).
* **Dynamic querying:** If the user likes `Rock` and selects `Energetic`, the engine constructs a highly specific YouTube Data API search querying for "Energetic Rock Playlist".
* **Frictionless Auto-play:** The resulting optimal YouTube playlist is immediately loaded and actively played using our embedded `Player.jsx` component.

## 6. History Tracking & Persistence

**Description:** Local logging of the user's sessions to prevent repetitive discovery experiences.

* **Timeline Component:** The `MoodHistory.jsx` displays a chronological feed of the user's most recent discoveries (e.g., "5 mins ago: Chill Mode matched with Indie Pop").
* **De-duplication Logic:** Prevents the history log from spamming absolute consecutive duplicates if the user spams a single mood button.
* **State Persistence:** Stores arrays for `musicMood_history`, `musicMood_genres`, and `musicMood_moods` exclusively within the browser's `localStorage` for privacy and persistence between sessions.
