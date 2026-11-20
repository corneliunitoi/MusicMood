-- Phase 0: lock down privileged functions
revoke execute on function public.resolve_or_create_test_user(text, text, text, text) from public, anon, authenticated;

-- Trigger functions are fired by Postgres; they never need to be callable via /rest/v1/rpc
revoke execute on function public.sync_track_artist() from public, anon, authenticated;
revoke execute on function public.update_artist_track_count() from public, anon, authenticated;
revoke execute on function public.sync_artist_affinity_from_favorites() from public, anon, authenticated;
revoke execute on function public.sync_artist_affinity_from_history() from public, anon, authenticated;

-- Unused superseded RPC
revoke execute on function public.get_priority_inflation_candidates(integer, integer, text, text) from public, anon, authenticated;

-- Pin search_path (security advisor lint 0011)
alter function public.get_random_unmapped_local_tracks(integer) set search_path = public;
alter function public.get_library_taste_summary() set search_path = public;
alter function public.get_catalog_artist_names() set search_path = public;
alter function public.request_staged_artist(uuid) set search_path = public;
alter function public.sync_track_artist() set search_path = public;
alter function public.update_artist_track_count() set search_path = public;
alter function public.get_dynamic_priority_inflation_candidates(integer, integer, text, text) set search_path = public;
alter function public.sync_user_favorites(uuid, jsonb) set search_path = public;

-- Unused tables (0 rows, no code references)
revoke all on public.history, public.music_users from anon, authenticated;
