-- =====================================================================
-- MusicMood Schema V2: Intent-Driven Music State Machine Architecture
-- =====================================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. CANONICAL LOOKUP TABLES (Moods & Genres)
-- ---------------------------------------------------------------------

-- Table: moods (Canonical emotional & functional states)
CREATE TABLE IF NOT EXISTS public.moods (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    emoji TEXT NOT NULL,
    default_energy NUMERIC(3, 2) DEFAULT 0.50,
    search_context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: genres (Harmonic graph ontology nodes)
CREATE TABLE IF NOT EXISTS public.genres (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent_genre_id TEXT REFERENCES public.genres(id) ON DELETE SET NULL,
    energy_baseline NUMERIC(3, 2) DEFAULT 0.50,
    is_instrumental_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genres_parent ON public.genres(parent_genre_id);

-- ---------------------------------------------------------------------
-- 2. USER ENTITIES & PREFERENCES
-- ---------------------------------------------------------------------

-- Table: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    discovery_level NUMERIC(3, 2) DEFAULT 0.50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: user_dealbreakers (Hard negative filters / blacklists)
CREATE TABLE IF NOT EXISTS public.user_dealbreakers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL, -- 'exclude_genre' or 'exclude_keyword'
    target_value TEXT NOT NULL, -- e.g. 'autotune', 'trap_modern', 'screamo'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_dealbreaker UNIQUE (user_id, rule_type, target_value)
);

CREATE INDEX IF NOT EXISTS idx_user_dealbreakers_user ON public.user_dealbreakers(user_id);

-- Table: user_mood_genre_affinities (The Core State Machine Brain)
-- Connects (User + Mood + Genre) with dynamic weights, fatigue & dwell
CREATE TABLE IF NOT EXISTS public.user_mood_genre_affinities (
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    mood_id TEXT NOT NULL REFERENCES public.moods(id) ON DELETE CASCADE,
    genre_id TEXT NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
    affinity_weight NUMERIC(4, 3) NOT NULL DEFAULT 0.500, -- 0.050 to 0.250 (normalized)
    fatigue NUMERIC(4, 3) NOT NULL DEFAULT 0.000, -- Satiation / anti-stagnation
    consecutive_listens INT NOT NULL DEFAULT 0, -- Dwell tracker (max 2 before auto-shift)
    last_listened_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, mood_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_affinities_lookup 
ON public.user_mood_genre_affinities(user_id, mood_id, affinity_weight DESC);

-- ---------------------------------------------------------------------
-- 3. THE EXPANDING ONLINE TRACK CATALOG (Zero-Quota Playback)
-- ---------------------------------------------------------------------

-- Table: artists (Normalized canonical artist entities)
CREATE TABLE IF NOT EXISTS public.artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT,
    primary_genre_id TEXT REFERENCES public.genres(id) ON DELETE SET NULL,
    avatar_url TEXT,
    youtube_channel_id TEXT,
    track_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artists_name ON public.artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_genre ON public.artists(primary_genre_id);

-- Table: tracks (Global catalog self-expanding from online sources & library)
CREATE TABLE IF NOT EXISTS public.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_video_id TEXT, -- Zero-Quota playback key (indexed)
    isrc TEXT UNIQUE, -- Canonical International Standard Recording Code
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
    album TEXT,
    primary_genre_id TEXT REFERENCES public.genres(id) ON DELETE SET NULL,
    energy NUMERIC(3, 2), -- 0.00 to 1.00
    is_instrumental BOOLEAN DEFAULT FALSE,
    source TEXT DEFAULT 'online_discovery', -- 'online_discovery', 'local_library', 'crowd'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracks_yt_id ON public.tracks(youtube_video_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON public.tracks(artist_id);

CREATE INDEX IF NOT EXISTS idx_tracks_genre_yt 
ON public.tracks(primary_genre_id, youtube_video_id) 
WHERE youtube_video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracks_artist_title 
ON public.tracks(artist, title);

-- Table: track_subgenres (Many-to-Many bridge for deep harmonic tags)
CREATE TABLE IF NOT EXISTS public.track_subgenres (
    track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    genre_id TEXT NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
    PRIMARY KEY (track_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_track_subgenres_genre ON public.track_subgenres(genre_id);

-- ---------------------------------------------------------------------
-- 4. LISTENING HISTORY & SATIATION GUARDS
-- ---------------------------------------------------------------------

-- Table: listening_history (Scrobbles feeding anti-loop & cooldown guards)
CREATE TABLE IF NOT EXISTS public.listening_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    mood_id TEXT REFERENCES public.moods(id) ON DELETE SET NULL,
    genre_id TEXT REFERENCES public.genres(id) ON DELETE SET NULL,
    listened_seconds INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    skipped BOOLEAN DEFAULT FALSE,
    liked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user_recent 
ON public.listening_history(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dealbreakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mood_genre_affinities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_subgenres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;

-- Moods & Genres: Publicly readable by all users
CREATE POLICY "Allow public read on moods" ON public.moods FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow public read on genres" ON public.genres FOR SELECT TO authenticated, anon USING (true);

-- Tracks: Readable by everyone; insertable by everyone (self-expanding catalog)
CREATE POLICY "Allow public read on tracks" ON public.tracks FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow public insert on tracks" ON public.tracks FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow public update on tracks" ON public.tracks FOR UPDATE TO authenticated, anon USING (true);

CREATE POLICY "Allow public read on track_subgenres" ON public.track_subgenres FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow public insert on track_subgenres" ON public.track_subgenres FOR INSERT TO authenticated, anon WITH CHECK (true);

-- User Profiles: Owner only
CREATE POLICY "Users view own profile" ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User Dealbreakers: Owner only
CREATE POLICY "Users view own dealbreakers" ON public.user_dealbreakers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own dealbreakers" ON public.user_dealbreakers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own dealbreakers" ON public.user_dealbreakers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- User Affinities: Owner only
CREATE POLICY "Users view own affinities" ON public.user_mood_genre_affinities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own affinities" ON public.user_mood_genre_affinities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Listening History: Owner only
CREATE POLICY "Users view own history" ON public.listening_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own history" ON public.listening_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. SEED DATA (Canonical Moods & Genres)
-- ---------------------------------------------------------------------

INSERT INTO public.moods (id, label, emoji, default_energy, search_context) VALUES
    ('focus', 'Deep Focus', '🧠', 0.40, 'deep focus concentration study instrumental'),
    ('chill', 'Chill & Relax', '🧘', 0.30, 'relaxing chillout calm smooth'),
    ('energetic', 'High Energy', '⚡', 0.85, 'high energy workout intense pump'),
    ('late_night', 'Late Night', '🌃', 0.35, 'late night vibes dark chill'),
    ('melancholic', 'Melancholic', '🥀', 0.35, 'melancholic sadness deep thoughts emotional'),
    ('happy', 'Upbeat Feel Good', '😊', 0.70, 'upbeat feel good positive bright'),
    ('workout', 'Workout Pump', '💪', 0.90, 'gym workout hard cardio bass'),
    ('sleep', 'Wind Down & Sleep', '🌙', 0.15, 'sleep ambient deep sleep drone')
ON CONFLICT (id) DO UPDATE SET 
    label = EXCLUDED.label, 
    emoji = EXCLUDED.emoji,
    default_energy = EXCLUDED.default_energy;

-- Insert Primary and Sub-Genres
INSERT INTO public.genres (id, label, parent_genre_id, energy_baseline, is_instrumental_default) VALUES
    ('rock', 'Classic Rock', NULL, 0.60, false),
    ('alt_rock', 'Alternative Rock', 'rock', 0.65, false),
    ('indie_rock', 'Indie Rock', 'rock', 0.55, false),
    ('post_rock', 'Post-Rock', 'rock', 0.50, true),
    ('math_rock', 'Math Rock', 'rock', 0.70, true),
    ('prog_rock', 'Prog Rock', 'rock', 0.70, false),
    ('prog_metal', 'Prog Metal', 'rock', 0.85, false),
    ('metal', 'Heavy Metal', 'rock', 0.85, false),
    ('electronic', 'Electronic', NULL, 0.70, true),
    ('ambient_electronic', 'Ambient Electronic', 'electronic', 0.25, true),
    ('synthwave', 'Synthwave', 'electronic', 0.65, true),
    ('darksynth', 'Darksynth', 'electronic', 0.85, true),
    ('techno', 'Techno', 'electronic', 0.75, true),
    ('drum_and_bass', 'Drum & Bass', 'electronic', 0.85, false),
    ('idm', 'IDM / Glitch', 'electronic', 0.55, true),
    ('chill', 'Chill & Lo-Fi', NULL, 0.30, true),
    ('lofi_hiphop', 'Lo-Fi Chill Beats', 'chill', 0.35, true),
    ('ambient', 'Pure Ambient', 'chill', 0.15, true),
    ('acoustic_folk', 'Indie Folk', 'chill', 0.40, false),
    ('classical', 'Classical & Instrumental', NULL, 0.45, true),
    ('neo_classical', 'Modern Neo-Classical', 'classical', 0.35, true),
    ('cinematic_orchestral', 'Cinematic Orchestral', 'classical', 0.70, true),
    ('jazz', 'Jazz & Soul', NULL, 0.50, true),
    ('smooth_jazz', 'Smooth Jazz', 'jazz', 0.40, true),
    ('bebop_jazz', 'Modal / Fusion Jazz', 'jazz', 0.65, true),
    ('soul_funk', 'Soul & Funk', 'jazz', 0.70, false),
    ('hip_hop', 'Hip-Hop', NULL, 0.65, false),
    ('boom_bap', '90s Boom Bap', 'hip_hop', 0.60, false),
    ('rnb', 'Contemporary R&B', 'hip_hop', 0.50, false),
    ('pop', 'Pop', NULL, 0.65, false),
    ('indie_pop', 'Indie Pop', 'pop', 0.55, false)
ON CONFLICT (id) DO UPDATE SET 
    label = EXCLUDED.label, 
    energy_baseline = EXCLUDED.energy_baseline;

-- ---------------------------------------------------------------------
-- 7. INITIAL MIGRATION FROM local_metadata INTO tracks
-- ---------------------------------------------------------------------

-- Copy distinct scanned tracks from local_metadata into tracks table
INSERT INTO public.tracks (title, artist, primary_genre_id, source)
SELECT DISTINCT ON (LOWER(TRIM(artist)), LOWER(TRIM(track_name)))
    TRIM(track_name) AS title,
    TRIM(artist) AS artist,
    NULL AS primary_genre_id,
    'local_library' AS source
FROM public.local_metadata
WHERE track_name IS NOT NULL AND artist IS NOT NULL
ON CONFLICT DO NOTHING;

-- Grant access on public schema tables for anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. USER FEEDBACK
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    name TEXT,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'feedback' AND policyname = 'Allow public insert on feedback'
    ) THEN
        CREATE POLICY "Allow public insert on feedback" ON public.feedback
        FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'feedback' AND policyname = 'Allow select feedback for authenticated'
    ) THEN
        CREATE POLICY "Allow select feedback for authenticated" ON public.feedback
        FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 9. ARCHIVE METADATA & USER FAVORITES SECURITY (RLS)
-- ---------------------------------------------------------------------

-- Enable Row Level Security
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_metadata ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- user_favorites: Authenticated users can only read, insert, update, delete their own records
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'Users can view own favorites'
    ) THEN
        CREATE POLICY "Users can view own favorites" ON public.user_favorites
        FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'Users can insert own favorites'
    ) THEN
        CREATE POLICY "Users can insert own favorites" ON public.user_favorites
        FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'Users can update own favorites'
    ) THEN
        CREATE POLICY "Users can update own favorites" ON public.user_favorites
        FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_favorites' AND policyname = 'Users can delete own favorites'
    ) THEN
        CREATE POLICY "Users can delete own favorites" ON public.user_favorites
        FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
    END IF;

    -- local_metadata: Public read, insert, update for catalog/JIT resolution; deletion restricted
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'local_metadata' AND policyname = 'Allow public read access on local_metadata'
    ) THEN
        CREATE POLICY "Allow public read access on local_metadata" ON public.local_metadata
        FOR SELECT TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'local_metadata' AND policyname = 'Allow public insert on local_metadata'
    ) THEN
        CREATE POLICY "Allow public insert on local_metadata" ON public.local_metadata
        FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'local_metadata' AND policyname = 'Allow public update on local_metadata'
    ) THEN
        CREATE POLICY "Allow public update on local_metadata" ON public.local_metadata
        FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;
