-- =====================================================================
-- Phase 2b (v0.8.7d): user-scoped RPCs, one vote per user, guest weighting,
-- rate limits, and removal of the legacy identity RPCs.
--
--   * Influence weight: Google users 1.0, anonymous guests 0.25
--   * Rate limit: at most 100 influencing actions per 30 minutes per account
--     (upvotes; favorites and listening-history likes still save, but only
--     the first 100 in 30 minutes move track/artist scores)
--   * tracks.upvotes / artists.upvotes stay integers (rounded) for existing
--     readers; precise weighted totals live in the new upvote_score columns,
--     seeded from today's counts as the baseline.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Weighted score columns (baseline = current counts)
-- ---------------------------------------------------------------------
alter table public.tracks  add column if not exists upvote_score numeric(12,2);
alter table public.artists add column if not exists upvote_score numeric(12,2);
update public.tracks  set upvote_score = coalesce(upvotes, 0) where upvote_score is null;
update public.artists set upvote_score = coalesce(upvotes, 0) where upvote_score is null;
alter table public.tracks  alter column upvote_score set default 0, alter column upvote_score set not null;
alter table public.artists alter column upvote_score set default 0, alter column upvote_score set not null;

-- Clients may not write the score columns (tracks: only youtube_video_id/artist/updated_at are granted)

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
create or replace function public.influence_weight(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select case
        when exists (select 1 from auth.users u where u.id = p_user_id and coalesce(u.is_anonymous, false)) then 0.25
        else 1.0
    end;
$$;
revoke execute on function public.influence_weight(uuid) from public, anon, authenticated;

-- Applies a weighted change to a track (by video id) and/or an artist (by name)
create or replace function public.apply_influence(p_video_id text, p_artist text, p_vote numeric, p_affinity numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_video_id is not null and length(p_video_id) > 0 and p_vote <> 0 then
        update public.tracks
        set upvote_score = greatest(0, upvote_score + p_vote),
            upvotes      = round(greatest(0, upvote_score + p_vote))::int
        where youtube_video_id = p_video_id;
    end if;
    if p_artist is not null and length(trim(p_artist)) > 0 and (p_vote <> 0 or p_affinity <> 0) then
        update public.artists
        set upvote_score   = greatest(0, upvote_score + p_vote),
            upvotes        = round(greatest(0, upvote_score + p_vote))::int,
            affinity_score = greatest(0, coalesce(affinity_score, 0) + p_affinity)
        where lower(trim(name)) = lower(trim(p_artist));
    end if;
end;
$$;
revoke execute on function public.apply_influence(text, text, numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. One vote per user per track
-- ---------------------------------------------------------------------
create table if not exists public.user_upvotes (
    user_id uuid not null references public.user_profiles(id) on delete cascade,
    video_id text not null,
    artist text,
    weight numeric(4,2) not null,
    created_at timestamptz not null default now(),
    primary key (user_id, video_id)
);
create index if not exists idx_user_upvotes_recent on public.user_upvotes(user_id, created_at desc);

alter table public.user_upvotes enable row level security;
create policy "Users read own upvotes" on public.user_upvotes
    for select to authenticated using (user_id = auth.uid());
revoke all on public.user_upvotes from anon, authenticated;
grant select on public.user_upvotes to authenticated;   -- writes only through upvote_track()

-- Same signature as before so existing clients keep working.
-- p_delta > 0 casts this user's vote (once per track); p_delta < 0 withdraws it.
-- The magnitude of p_delta is ignored.
create or replace function public.upvote_track(p_video_id text, p_artist text, p_delta integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_weight numeric;
    v_existing public.user_upvotes%rowtype;
    v_recent int;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_signed_in');
    end if;
    if p_video_id is null or length(p_video_id) = 0 or coalesce(p_delta, 0) = 0 then
        return jsonb_build_object('success', false, 'error', 'invalid_request');
    end if;

    select * into v_existing from public.user_upvotes where user_id = v_uid and video_id = p_video_id;

    if p_delta > 0 then
        if found then
            return jsonb_build_object('success', true, 'status', 'already_voted');
        end if;

        select count(*) into v_recent from public.user_upvotes
        where user_id = v_uid and created_at > now() - interval '30 minutes';
        if v_recent >= 100 then
            return jsonb_build_object('success', false, 'error', 'rate_limited');
        end if;

        v_weight := public.influence_weight(v_uid);
        insert into public.user_upvotes (user_id, video_id, artist, weight)
        values (v_uid, p_video_id, nullif(trim(p_artist), ''), v_weight);
        perform public.apply_influence(p_video_id, p_artist, v_weight, v_weight * 5);
        return jsonb_build_object('success', true, 'status', 'voted', 'weight', v_weight);
    else
        if not found then
            return jsonb_build_object('success', true, 'status', 'not_voted');
        end if;
        delete from public.user_upvotes where user_id = v_uid and video_id = p_video_id;
        perform public.apply_influence(p_video_id, coalesce(v_existing.artist, p_artist), -v_existing.weight, -v_existing.weight * 5);
        return jsonb_build_object('success', true, 'status', 'withdrawn');
    end if;
end;
$$;
revoke execute on function public.upvote_track(text, text, integer) from public, anon;
grant execute on function public.upvote_track(text, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Favorites: weighted, rate-limited influence (saving is never blocked)
-- ---------------------------------------------------------------------
alter table public.user_favorites add column if not exists influence numeric(4,2) not null default 0;

create or replace function public.sync_artist_affinity_from_favorites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_weight numeric;
    v_recent int;
begin
    if tg_op = 'INSERT' then
        -- Legacy-profile merges move existing favorites: carry their influence over unchanged
        if current_setting('musicmood.moving_favorites', true) = 'on' then
            return new;
        end if;
        select count(*) into v_recent from public.user_favorites
        where user_id = new.user_id and influence > 0 and created_at > now() - interval '30 minutes' and id <> new.id;
        if v_recent >= 100 then
            return new;  -- saved, but no influence
        end if;
        v_weight := public.influence_weight(new.user_id);
        update public.user_favorites set influence = v_weight where id = new.id;
        perform public.apply_influence(new.video_id, new.artist, v_weight, v_weight * 10);
        return new;
    elsif tg_op = 'DELETE' then
        if current_setting('musicmood.moving_favorites', true) = 'on' then
            return old;
        end if;
        if coalesce(old.influence, 0) > 0 then
            perform public.apply_influence(old.video_id, old.artist, -old.influence, -old.influence * 10);
        end if;
        return old;
    end if;
    return null;
end;
$$;

-- Existing favorites were counted at full weight under the old trigger
update public.user_favorites set influence = 1.0 where influence = 0;

-- The trigger must fire AFTER INSERT so the row exists for the influence update
drop trigger if exists trg_artist_affinity_favorites on public.user_favorites;
create trigger trg_artist_affinity_favorites
    after insert or delete on public.user_favorites
    for each row execute function public.sync_artist_affinity_from_favorites();

-- ---------------------------------------------------------------------
-- 5. Listening history: weighted, rate-limited affinity
-- ---------------------------------------------------------------------
create or replace function public.sync_artist_affinity_from_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_artist text;
    v_delta numeric := 0;
    v_recent int;
begin
    if new.track_id is null then
        return new;
    end if;
    if new.liked = true then v_delta := v_delta + 5; end if;
    if new.completed = true then v_delta := v_delta + 2; end if;
    if new.skipped = true then v_delta := v_delta - 2; end if;
    if v_delta = 0 then
        return new;
    end if;

    select count(*) into v_recent from public.listening_history
    where user_id = new.user_id and created_at > now() - interval '30 minutes';
    if v_recent > 100 then
        return new;
    end if;

    select artist into v_artist from public.tracks where id = new.track_id;
    if v_artist is null then
        return new;
    end if;
    perform public.apply_influence(null, v_artist, 0, v_delta * public.influence_weight(new.user_id));
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Favorites & calibration RPCs act only on the signed-in user.
--    Signatures are unchanged for compatibility; p_user_id is ignored.
-- ---------------------------------------------------------------------
create or replace function public.get_user_favorites(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_result jsonb;
begin
    if v_uid is null then
        return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', video_id, 'videoId', video_id, 'title', title, 'artist', artist,
        'genre', genre, 'thumbnail', thumbnail, 'addedAt', created_at
    ) order by created_at desc), '[]'::jsonb)
    into v_result
    from public.user_favorites where user_id = v_uid;
    return v_result;
end;
$$;

create or replace function public.remove_user_favorite(p_user_id uuid, p_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return jsonb_build_object('success', false, 'error', 'not_signed_in');
    end if;
    delete from public.user_favorites where user_id = auth.uid() and video_id = p_video_id;
    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.sync_user_favorites(p_user_id uuid, p_favorites jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    fav record;
    v_count int := 0;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_signed_in');
    end if;
    if jsonb_typeof(p_favorites) <> 'array' or jsonb_array_length(p_favorites) > 500 then
        return jsonb_build_object('success', false, 'error', 'invalid_request');
    end if;

    for fav in select * from jsonb_to_recordset(p_favorites) as x(id text, video_id text, title text, artist text, genre text, thumbnail text) loop
        if coalesce(fav.video_id, fav.id) is null then
            continue;
        end if;
        insert into public.user_favorites (user_id, video_id, title, artist, genre, thumbnail, created_at)
        values (v_uid, coalesce(fav.video_id, fav.id), fav.title, fav.artist, fav.genre, fav.thumbnail, now())
        on conflict (user_id, video_id) do update
        set title = excluded.title, genre = excluded.genre, thumbnail = excluded.thumbnail;
        v_count := v_count + 1;
    end loop;
    return jsonb_build_object('success', true, 'count', v_count);
end;
$$;

create or replace function public.get_user_calibration(p_user_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select calibration from public.user_profiles where id = auth.uid()), '{}'::jsonb);
$$;

create or replace function public.sync_user_calibration(p_user_id uuid, p_calibration jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_item text;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'not_signed_in');
    end if;
    if jsonb_typeof(p_calibration) <> 'object' or length(p_calibration::text) > 20000 then
        return jsonb_build_object('success', false, 'error', 'invalid_request');
    end if;

    update public.user_profiles
    set calibration = p_calibration,
        discovery_level = coalesce((p_calibration->>'discoveryLevel')::numeric, discovery_level),
        updated_at = now()
    where id = v_uid;

    if p_calibration ? 'dealbreakers' and jsonb_typeof(p_calibration->'dealbreakers') = 'array' then
        delete from public.user_dealbreakers where user_id = v_uid;
        for v_item in select jsonb_array_elements_text(p_calibration->'dealbreakers') limit 100 loop
            insert into public.user_dealbreakers (user_id, rule_type, target_value)
            values (v_uid, 'exclude_keyword', v_item) on conflict do nothing;
        end loop;
    end if;

    if p_calibration ? 'anchors' and jsonb_typeof(p_calibration->'anchors') = 'array' then
        delete from public.user_mood_genre_affinities where user_id = v_uid;
        for v_item in select jsonb_array_elements_text(p_calibration->'anchors') limit 50 loop
            if exists (select 1 from public.genres where id = v_item) then
                insert into public.user_mood_genre_affinities (user_id, mood_id, genre_id, affinity_weight, fatigue, consecutive_listens)
                values (v_uid, 'focus', v_item, 0.25, 0.000, 0) on conflict do nothing;
            end if;
        end loop;
    end if;

    return jsonb_build_object('success', true, 'calibration', p_calibration);
end;
$$;

revoke execute on function public.get_user_favorites(uuid) from public, anon;
revoke execute on function public.remove_user_favorite(uuid, text) from public, anon;
revoke execute on function public.sync_user_favorites(uuid, jsonb) from public, anon;
revoke execute on function public.get_user_calibration(uuid) from public, anon;
revoke execute on function public.sync_user_calibration(uuid, jsonb) from public, anon;
grant execute on function public.get_user_favorites(uuid) to authenticated;
grant execute on function public.remove_user_favorite(uuid, text) to authenticated;
grant execute on function public.sync_user_favorites(uuid, jsonb) to authenticated;
grant execute on function public.get_user_calibration(uuid) to authenticated;
grant execute on function public.sync_user_calibration(uuid, jsonb) to authenticated;

-- request_staged_artist: signed-in users only
revoke execute on function public.request_staged_artist(uuid) from public, anon;
grant execute on function public.request_staged_artist(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Legacy-profile merge: move favorites without re-counting influence
-- ---------------------------------------------------------------------
create or replace function public.claim_legacy_profile(p_new_id uuid, p_google_sub text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old public.user_profiles%rowtype;
begin
    if p_google_sub is null or p_google_sub = '' then
        return;
    end if;
    select * into v_old from public.user_profiles where google_id = p_google_sub and id <> p_new_id;
    if not found then
        return;
    end if;

    perform set_config('musicmood.moving_favorites', 'on', true);
    insert into public.user_favorites (user_id, video_id, title, artist, genre, thumbnail, created_at, influence)
    select p_new_id, video_id, title, artist, genre, thumbnail, created_at, influence
    from public.user_favorites where user_id = v_old.id
    on conflict (user_id, video_id) do nothing;
    delete from public.user_favorites where user_id = v_old.id;
    perform set_config('musicmood.moving_favorites', 'off', true);

    update public.listening_history set user_id = p_new_id where user_id = v_old.id;

    insert into public.user_upvotes (user_id, video_id, artist, weight, created_at)
    select p_new_id, video_id, artist, weight, created_at from public.user_upvotes where user_id = v_old.id
    on conflict (user_id, video_id) do nothing;
    delete from public.user_upvotes where user_id = v_old.id;

    insert into public.user_dealbreakers (user_id, rule_type, target_value, created_at)
    select p_new_id, rule_type, target_value, created_at from public.user_dealbreakers where user_id = v_old.id
    on conflict (user_id, rule_type, target_value) do nothing;
    delete from public.user_dealbreakers where user_id = v_old.id;

    insert into public.user_mood_genre_affinities (user_id, mood_id, genre_id, affinity_weight, fatigue, consecutive_listens, last_listened_at)
    select p_new_id, mood_id, genre_id, affinity_weight, fatigue, consecutive_listens, last_listened_at
    from public.user_mood_genre_affinities where user_id = v_old.id
    on conflict (user_id, mood_id, genre_id) do nothing;
    delete from public.user_mood_genre_affinities where user_id = v_old.id;

    update public.track_genre_flags t set user_id = p_new_id::text
    where t.user_id = v_old.id::text
      and not exists (select 1 from public.track_genre_flags x where x.track_id = t.track_id and x.user_id = p_new_id::text);
    update public.feedback set user_id = p_new_id::text where user_id = v_old.id::text;

    update public.user_profiles n set
        role            = coalesce(v_old.role, n.role),
        user_class      = case when v_old.user_class is not null and v_old.user_class <> 'guest' then v_old.user_class else n.user_class end,
        calibration     = case when coalesce(n.calibration, '{}'::jsonb) = '{}'::jsonb then v_old.calibration else n.calibration end,
        discovery_level = coalesce(v_old.discovery_level, n.discovery_level),
        username        = coalesce(n.username, v_old.username),
        avatar_url      = coalesce(n.avatar_url, v_old.avatar_url),
        updated_at      = now()
    where n.id = p_new_id;

    delete from public.user_profiles where id = v_old.id;
end;
$$;
revoke execute on function public.claim_legacy_profile(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Remove the legacy client-asserted identity RPCs (unused since v0.8.7b)
-- ---------------------------------------------------------------------
drop function if exists public.resolve_or_create_user(text, text, text, text);
drop function if exists public.resolve_or_create_user(text, text, text, text, text);
drop function if exists public.resolve_or_create_test_user(text, text, text, text);
