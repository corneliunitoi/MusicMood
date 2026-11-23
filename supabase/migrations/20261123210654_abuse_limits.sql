-- =====================================================================
-- v0.9.0k: abuse limits for signed-in accounts (guests included)
--
--   1. Catalog inserts (tracks, artists, local_metadata, artist_suggestions) are limited
--      per account per hour (guests lower), and track text / video ids get sanity checks.
--   2. Feedback: length limits and an hourly limit per account (per network address when
--      there is no session).
--   3. Filling a missing video id: only a well-formed id is accepted, and a track's artist
--      name only changes when it was empty or a placeholder.
--
-- Additive: one locked-down table and triggers; no existing column changes. Scripts and the
-- service role (anything that is not the "anon" / "authenticated" API role) are never limited,
-- and neither are admins. Limits are generous for normal listening (discovery adds tracks one
-- at a time while playing). A blocked insert simply fails; the app keeps playing.
-- Rollback: supabase/rollbacks/<version>_abuse_limits_rollback.sql
-- =====================================================================

-- 1. Hourly counters ---------------------------------------------------
create table if not exists public.insert_quota (
    quota_key    uuid        not null,
    bucket       text        not null,
    window_start timestamptz not null,
    n            integer     not null default 0,
    primary key (quota_key, bucket)
);
alter table public.insert_quota enable row level security;
revoke all on public.insert_quota from public, anon, authenticated;

create or replace function public.bump_quota(p_key uuid, p_bucket text, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_win timestamptz := date_trunc('hour', now());
    v_n   integer;
begin
    insert into public.insert_quota as q (quota_key, bucket, window_start, n)
    values (p_key, p_bucket, v_win, 1)
    on conflict (quota_key, bucket) do update
        set n = case when q.window_start < v_win then 1 else q.n + 1 end,
            window_start = v_win
    returning q.n into v_n;

    if v_n > p_limit then
        raise exception 'rate_limit_exceeded: too many % in the last hour (limit %)', p_bucket, p_limit
            using errcode = '54000';
    end if;
end;
$$;
revoke execute on function public.bump_quota(uuid, text, integer) from public, anon, authenticated;

-- 2. Per-account insert limit (arguments: bucket, guest limit, signed-in limit) ---
create or replace function public.trg_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid   uuid;
    v_guest boolean;
    v_limit integer;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then return new; end if;
    v_uid := auth.uid();
    if v_uid is null or public.is_admin() then return new; end if;

    v_guest := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
    v_limit := case when v_guest then tg_argv[1]::integer else tg_argv[2]::integer end;
    perform public.bump_quota(v_uid, tg_argv[0], v_limit);
    return new;
end;
$$;
revoke execute on function public.trg_quota() from public, anon, authenticated;

drop trigger if exists trg_quota_tracks on public.tracks;
create trigger trg_quota_tracks before insert on public.tracks
    for each row execute function public.trg_quota('tracks', 60, 300);

drop trigger if exists trg_quota_artists on public.artists;
create trigger trg_quota_artists before insert on public.artists
    for each row execute function public.trg_quota('artists', 60, 300);

drop trigger if exists trg_quota_local_metadata on public.local_metadata;
create trigger trg_quota_local_metadata before insert on public.local_metadata
    for each row execute function public.trg_quota('local_metadata', 60, 300);

drop trigger if exists trg_quota_artist_suggestions on public.artist_suggestions;
create trigger trg_quota_artist_suggestions before insert on public.artist_suggestions
    for each row execute function public.trg_quota('artist_suggestions', 10, 30);

-- 3. Sanity checks on new tracks --------------------------------------------
create or replace function public.trg_tracks_sanity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' or public.is_admin() then return new; end if;
    if length(coalesce(new.title, '')) > 1000 or length(coalesce(new.artist, '')) > 1000 then
        raise exception 'text_too_long' using errcode = '22001';
    end if;
    if new.youtube_video_id is not null and new.youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
        raise exception 'invalid_video_id' using errcode = '22023';
    end if;
    return new;
end;
$$;
revoke execute on function public.trg_tracks_sanity() from public, anon, authenticated;

drop trigger if exists trg_tracks_sanity on public.tracks;
create trigger trg_tracks_sanity before insert on public.tracks
    for each row execute function public.trg_tracks_sanity();

-- 4. Feedback: length limits + hourly limit (per account, or per network address without a session) ---
create or replace function public.trg_feedback_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role  text := coalesce(auth.jwt() ->> 'role', '');
    v_uid   uuid;
    v_key   uuid;
    v_limit integer;
    v_h     json;
    v_ip    text;
begin
    if v_role not in ('anon', 'authenticated') then return new; end if;

    if length(coalesce(new.comment, '')) > 2000 or length(coalesce(new.name, '')) > 100 then
        raise exception 'feedback_too_long' using errcode = '22001';
    end if;

    v_uid := auth.uid();
    if v_uid is not null then
        if public.is_admin() then return new; end if;
        v_key := v_uid;
        v_limit := case when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 5 else 10 end;
    else
        begin
            v_h := nullif(current_setting('request.headers', true), '')::json;
        exception when others then
            v_h := null;
        end;
        v_ip := coalesce(nullif(v_h ->> 'cf-connecting-ip', ''),
                         nullif(v_h ->> 'x-real-ip', ''),
                         nullif(split_part(coalesce(v_h ->> 'x-forwarded-for', ''), ',', 1), ''),
                         'unknown');
        v_key := md5('ip:' || v_ip)::uuid;
        v_limit := 5;
    end if;

    perform public.bump_quota(v_key, 'feedback', v_limit);
    return new;
end;
$$;
revoke execute on function public.trg_feedback_guard() from public, anon, authenticated;

drop trigger if exists trg_feedback_guard on public.feedback;
create trigger trg_feedback_guard before insert on public.feedback
    for each row execute function public.trg_feedback_guard();

-- 5. Filling a missing video id: well-formed ids only; artist changes only for placeholders --------
create or replace function public.trg_guard_fill_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' or public.is_admin() then return new; end if;

    if old.youtube_video_id is not null then
        new.youtube_video_id := old.youtube_video_id;
    elsif new.youtube_video_id is not null and new.youtube_video_id !~ '^[A-Za-z0-9_-]{11}$' then
        new.youtube_video_id := null;
    end if;

    if tg_table_name = 'tracks' and new.artist is distinct from old.artist then
        if not (old.artist is null
                or btrim(old.artist) = ''
                or lower(btrim(old.artist)) in ('unknown', 'unknown artist', 'various', 'various artists')
                or old.artist ~ '^[0-9]+$') then
            new.artist := old.artist;
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function public.trg_guard_fill_update() from public, anon, authenticated;

drop trigger if exists trg_guard_fill_update on public.tracks;
create trigger trg_guard_fill_update before update on public.tracks
    for each row execute function public.trg_guard_fill_update();

drop trigger if exists trg_guard_fill_update on public.local_metadata;
create trigger trg_guard_fill_update before update on public.local_metadata
    for each row execute function public.trg_guard_fill_update();
