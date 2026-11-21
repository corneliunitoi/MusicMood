-- Script-only RPCs: scripts and workflows use the service-role key since v0.8.7c
revoke execute on function public.get_dynamic_priority_inflation_candidates(integer, integer, text, text) from public, anon, authenticated;
revoke execute on function public.get_random_unmapped_local_tracks(integer) from public, anon, authenticated;
-- Used by the signed-in app only
revoke execute on function public.get_library_taste_summary() from public, anon;
grant execute on function public.get_library_taste_summary() to authenticated;
-- Visitors without a session have no business with per-user tables
revoke select on public.user_profiles, public.user_favorites, public.user_dealbreakers,
    public.user_mood_genre_affinities, public.track_genre_flags from anon;
