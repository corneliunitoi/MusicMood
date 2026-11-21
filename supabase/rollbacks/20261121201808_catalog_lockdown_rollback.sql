-- =====================================================================
-- ROLLBACK for 20261121201808_catalog_lockdown.sql (v0.8.7c)
-- Restores the access rules and grants exactly as captured from the live
-- database on 2026-11-21 before the lockdown. No data is touched.
-- NOTE: the restored state is the INSECURE pre-v0.8.7c state. Use only to
-- recover from a breaking problem, then fix forward.
-- =====================================================================

begin;

-- 1. Remove what the lockdown added
drop policy if exists "Signed-in users add tracks" on public.tracks;
drop policy if exists "Signed-in users fill missing video ids" on public.tracks;
drop policy if exists "Admins delete tracks" on public.tracks;
drop policy if exists "Signed-in users add archive rows" on public.local_metadata;
drop policy if exists "Signed-in users fill missing archive video ids" on public.local_metadata;
drop policy if exists "Signed-in users add artists" on public.artists;
drop policy if exists "Signed-in users request new artists" on public.artist_suggestions;
drop policy if exists "Admins moderate artist suggestions" on public.artist_suggestions;
drop policy if exists "Admins delete artist suggestions" on public.artist_suggestions;
drop policy if exists "Users read own flags, admins read all" on public.track_genre_flags;
drop policy if exists "Users add own flags" on public.track_genre_flags;
drop policy if exists "Users update own flags, admins moderate" on public.track_genre_flags;
drop policy if exists "Admins delete flags" on public.track_genre_flags;
-- Playback reports are kept (harmless); uncomment to remove them too:
-- drop table if exists public.track_playback_reports;

-- 2. Restore pre-lockdown policies (captured from pg_policies)
drop policy if exists "Allow anon insert on listening_history" on public.listening_history;
drop policy if exists "Allow anon select on listening_history" on public.listening_history;
drop policy if exists "Allow delete on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow insert on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow public delete on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public delete on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public delete on tracks" on public.tracks;
drop policy if exists "Allow public insert on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public insert on artists" on public.artists;
drop policy if exists "Allow public insert on feedback" on public.feedback;
drop policy if exists "Allow public insert on local_metadata" on public.local_metadata;
drop policy if exists "Allow public insert on track_subgenres" on public.track_subgenres;
drop policy if exists "Allow public insert on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public insert on tracks" on public.tracks;
drop policy if exists "Allow public read access on local_metadata" on public.local_metadata;
drop policy if exists "Allow public read on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public read on artists" on public.artists;
drop policy if exists "Allow public read on track_subgenres" on public.track_subgenres;
drop policy if exists "Allow public read on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public read on tracks" on public.tracks;
drop policy if exists "Allow public update on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public update on artists" on public.artists;
drop policy if exists "Allow public update on local_metadata" on public.local_metadata;
drop policy if exists "Allow public update on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public update on tracks" on public.tracks;
drop policy if exists "Allow select on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow update on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Users insert own history" on public.listening_history;
drop policy if exists "Users view own history" on public.listening_history;
create policy "Allow anon insert on listening_history" on public.listening_history as PERMISSIVE for INSERT to anon with check (true);
create policy "Allow anon select on listening_history" on public.listening_history as PERMISSIVE for SELECT to anon using (true);
create policy "Allow delete on track_genre_flags" on public.track_genre_flags as PERMISSIVE for DELETE to anon, authenticated using (true);
create policy "Allow insert on track_genre_flags" on public.track_genre_flags as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public delete on artist_suggestions" on public.artist_suggestions as PERMISSIVE for DELETE to anon, authenticated using (true);
create policy "Allow public delete on track_suggestions" on public.track_suggestions as PERMISSIVE for DELETE to anon, authenticated using (true);
create policy "Allow public delete on tracks" on public.tracks as PERMISSIVE for DELETE to anon, authenticated using (true);
create policy "Allow public insert on artist_suggestions" on public.artist_suggestions as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on artists" on public.artists as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on feedback" on public.feedback as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on local_metadata" on public.local_metadata as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on track_subgenres" on public.track_subgenres as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on track_suggestions" on public.track_suggestions as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public insert on tracks" on public.tracks as PERMISSIVE for INSERT to anon, authenticated with check (true);
create policy "Allow public read access on local_metadata" on public.local_metadata as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public read on artist_suggestions" on public.artist_suggestions as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public read on artists" on public.artists as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public read on track_subgenres" on public.track_subgenres as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public read on track_suggestions" on public.track_suggestions as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public read on tracks" on public.tracks as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow public update on artist_suggestions" on public.artist_suggestions as PERMISSIVE for UPDATE to anon, authenticated using (true) with check (true);
create policy "Allow public update on artists" on public.artists as PERMISSIVE for UPDATE to anon, authenticated using (true);
create policy "Allow public update on local_metadata" on public.local_metadata as PERMISSIVE for UPDATE to anon, authenticated using (true) with check (true);
create policy "Allow public update on track_suggestions" on public.track_suggestions as PERMISSIVE for UPDATE to anon, authenticated using (true) with check (true);
create policy "Allow public update on tracks" on public.tracks as PERMISSIVE for UPDATE to anon, authenticated using (true);
create policy "Allow select on track_genre_flags" on public.track_genre_flags as PERMISSIVE for SELECT to anon, authenticated using (true);
create policy "Allow update on track_genre_flags" on public.track_genre_flags as PERMISSIVE for UPDATE to anon, authenticated using (true) with check (true);
create policy "Users insert own history" on public.listening_history as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users view own history" on public.listening_history as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));

-- 3. Restore table grants (captured from information_schema.role_table_grants)
revoke all on public.artist_suggestions, public.artists, public.feedback, public.genres, public.history,
    public.listening_history, public.local_metadata, public.moods, public.music_users, public.track_genre_flags,
    public.track_subgenres, public.track_suggestions, public.tracks, public.user_dealbreakers, public.user_favorites,
    public.user_mood_genre_affinities, public.user_profiles from anon, authenticated;
grant delete, insert, select, update on public.artist_suggestions, public.artists, public.genres, public.listening_history,
    public.local_metadata, public.moods, public.track_genre_flags, public.track_subgenres, public.track_suggestions,
    public.tracks, public.user_dealbreakers, public.user_favorites, public.user_mood_genre_affinities, public.user_profiles
    to anon, authenticated;
grant insert on public.feedback to anon, authenticated;

commit;
