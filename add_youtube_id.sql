-- Migration: Add youtube_id and isrc to local_metadata for zero-quota streaming
ALTER TABLE public.local_metadata 
ADD COLUMN IF NOT EXISTS youtube_id TEXT,
ADD COLUMN IF NOT EXISTS isrc TEXT;

-- Index to quickly find tracks that already have pre-resolved YouTube IDs
CREATE INDEX IF NOT EXISTS idx_local_metadata_youtube_id 
ON public.local_metadata(youtube_id) 
WHERE youtube_id IS NOT NULL;

-- Index for the State Machine to retrieve ready-to-play tracks by genre in <5ms
CREATE INDEX IF NOT EXISTS idx_local_metadata_genre_mapped 
ON public.local_metadata(genre, youtube_id) 
WHERE youtube_id IS NOT NULL;
