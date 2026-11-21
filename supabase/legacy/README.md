# Legacy SQL (historical reference only)

These files predate the migration history and **do not match the live database**
(for example, `add_youtube_id.sql` adds `local_metadata.youtube_id`, while the live
column is `youtube_video_id`; `schema_v2.sql` seeds 8 moods and 31 genres, while the
live database has 30 moods and 124 genres).

The source of truth is `supabase/migrations/`, in timestamp order, matching the
migrations recorded in the Supabase project. Do not run these files against
production.
