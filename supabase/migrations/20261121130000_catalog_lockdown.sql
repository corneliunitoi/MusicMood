-- =====================================================================
-- Phase 2a (v0.8.7c): catalog lockdown
--   Signed-in users (Google and anonymous guests) may ADD to the catalog
--   (playlist import, JIT discovery) and fill in a missing YouTube video id.
--   They may no longer change or delete existing catalog rows.
--   Updates/deletes are admin-only (is_admin()) or service role (scripts/workflows).
--   The anon role (no session) keeps read access and feedback submission only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Playback problem reports (replaces client-side track deletion)
-- ---------------------------------------------------------------------
create table if not exists public.track_playback_reports (
    id bigint generated always as identity primary key,
    track_id uuid references public.tracks(id) on delete cascade,
    youtube_video_id text,
    error_code integer,
    user_id uuid not null default auth.uid(),
    created_at timestamptz not null default now()
);

create index if not exists idx_playback_reports_video on public.track_playback_reports(youtube_video_id);

alter table public.track_playback_reports enable row level security;

create policy "Users report playback problems" on public.track_playback_reports
    for insert to authenticated with check (user_id = auth.uid());
create policy "Admins read playback reports" on public.track_playback_reports
    for select to authenticated using (public.is_admin());
create policy "Admins delete playback reports" on public.track_playback_reports
    for delete to authenticated using (public.is_admin());

revoke all on public.track_playback_reports from anon;
grant select, insert, delete on public.track_playback_reports to authenticated;

-- ---------------------------------------------------------------------
-- 1. No writes without a session
-- ---------------------------------------------------------------------
revoke insert, update, delete on all tables in schema public from anon;
grant insert on public.feedback to anon;  -- feedback form on the sign-in screen

-- ---------------------------------------------------------------------
-- 2. tracks
-- ---------------------------------------------------------------------
drop policy if exists "Allow public insert on tracks" on public.tracks;
drop policy if exists "Allow public update on tracks" on public.tracks;
drop policy if exists "Allow public delete on tracks" on public.tracks;

create policy "Signed-in users add tracks" on public.tracks
    for insert to authenticated with check (true);
-- Only rows still missing a video can be updated, and only these columns (see grants)
create policy "Signed-in users fill missing video ids" on public.tracks
    for update to authenticated using (youtube_video_id is null) with check (true);
create policy "Admins delete tracks" on public.tracks
    for delete to authenticated using (public.is_admin());

revoke update on public.tracks from authenticated;
grant update (youtube_video_id, artist, updated_at) on public.tracks to authenticated;

-- ---------------------------------------------------------------------
-- 3. local_metadata
-- ---------------------------------------------------------------------
drop policy if exists "Allow public insert on local_metadata" on public.local_metadata;
drop policy if exists "Allow public update on local_metadata" on public.local_metadata;

create policy "Signed-in users add archive rows" on public.local_metadata
    for insert to authenticated with check (true);
create policy "Signed-in users fill missing archive video ids" on public.local_metadata
    for update to authenticated using (youtube_video_id is null) with check (true);

revoke update, delete on public.local_metadata from authenticated;
grant update (youtube_video_id) on public.local_metadata to authenticated;

-- ---------------------------------------------------------------------
-- 4. artists (insert only; counts are kept by trigger, avatars by the scheduled job)
-- ---------------------------------------------------------------------
drop policy if exists "Allow public insert on artists" on public.artists;
drop policy if exists "Allow public update on artists" on public.artists;

create policy "Signed-in users add artists" on public.artists
    for insert to authenticated with check (true);

revoke update, delete on public.artists from authenticated;

-- ---------------------------------------------------------------------
-- 5. artist_suggestions: users may request new artists; moderation is admin-only
--    (requesting an existing candidate goes through request_staged_artist())
-- ---------------------------------------------------------------------
drop policy if exists "Allow public insert on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public update on artist_suggestions" on public.artist_suggestions;
drop policy if exists "Allow public delete on artist_suggestions" on public.artist_suggestions;

create policy "Signed-in users request new artists" on public.artist_suggestions
    for insert to authenticated with check (source = 'user_search_request');
create policy "Admins moderate artist suggestions" on public.artist_suggestions
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete artist suggestions" on public.artist_suggestions
    for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. track_suggestions / track_subgenres: written only by scripts (service role)
-- ---------------------------------------------------------------------
drop policy if exists "Allow public insert on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public update on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public delete on track_suggestions" on public.track_suggestions;
drop policy if exists "Allow public insert on track_subgenres" on public.track_subgenres;

revoke insert, update, delete on public.track_suggestions, public.track_subgenres from authenticated;

-- ---------------------------------------------------------------------
-- 7. track_genre_flags: users manage their own flags; admins moderate
-- ---------------------------------------------------------------------
drop policy if exists "Allow select on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow insert on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow update on track_genre_flags" on public.track_genre_flags;
drop policy if exists "Allow delete on track_genre_flags" on public.track_genre_flags;

create policy "Users read own flags, admins read all" on public.track_genre_flags
    for select to authenticated using (user_id = auth.uid()::text or public.is_admin());
create policy "Users add own flags" on public.track_genre_flags
    for insert to authenticated with check (user_id = auth.uid()::text);
create policy "Users update own flags, admins moderate" on public.track_genre_flags
    for update to authenticated
    using (user_id = auth.uid()::text or public.is_admin())
    with check (user_id = auth.uid()::text or public.is_admin());
create policy "Admins delete flags" on public.track_genre_flags
    for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. listening_history: anon could read and write everyone's history
-- ---------------------------------------------------------------------
drop policy if exists "Allow anon insert on listening_history" on public.listening_history;
drop policy if exists "Allow anon select on listening_history" on public.listening_history;
revoke select on public.listening_history from anon;
