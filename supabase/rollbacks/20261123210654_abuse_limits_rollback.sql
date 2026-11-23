-- Rollback for 20261123210654_abuse_limits.sql (v0.9.0k): removes the abuse-limit triggers,
-- functions and the counter table. Safe to run at any time; catalog data is untouched.
drop trigger if exists trg_quota_tracks on public.tracks;
drop trigger if exists trg_quota_artists on public.artists;
drop trigger if exists trg_quota_local_metadata on public.local_metadata;
drop trigger if exists trg_quota_artist_suggestions on public.artist_suggestions;
drop trigger if exists trg_tracks_sanity on public.tracks;
drop trigger if exists trg_feedback_guard on public.feedback;
drop trigger if exists trg_guard_fill_update on public.tracks;
drop trigger if exists trg_guard_fill_update on public.local_metadata;
drop function if exists public.trg_quota();
drop function if exists public.trg_tracks_sanity();
drop function if exists public.trg_feedback_guard();
drop function if exists public.trg_guard_fill_update();
drop function if exists public.bump_quota(uuid, text, integer);
drop table if exists public.insert_quota;
