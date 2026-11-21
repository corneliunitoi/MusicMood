-- =====================================================================
-- Phase 1 (v0.8.7b): Supabase Auth becomes the only source of identity.
--   * Every auth.users row (Google or anonymous guest) gets a user_profiles row
--     with the same id, so auth.uid() = user_profiles.id.
--   * On a user's first Google sign-in (or when a guest links Google), their
--     legacy profile (matched by the verified Google user id) is merged in:
--     favorites, history, dealbreakers, affinities, flags, feedback, calibration
--     and role move to the new id.
--   * Clients can no longer change role, user_class, google_id or is_guest.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Merge a legacy profile into the new auth-backed profile
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

    select * into v_old
    from public.user_profiles
    where google_id = p_google_sub and id <> p_new_id;

    if not found then
        return;
    end if;

    -- Favorites (unique per user + video)
    insert into public.user_favorites (user_id, video_id, title, artist, genre, thumbnail, created_at)
    select p_new_id, video_id, title, artist, genre, thumbnail, created_at
    from public.user_favorites where user_id = v_old.id
    on conflict (user_id, video_id) do nothing;
    delete from public.user_favorites where user_id = v_old.id;

    -- Listening history (no uniqueness)
    update public.listening_history set user_id = p_new_id where user_id = v_old.id;

    -- Dealbreakers (unique per user + rule + value)
    insert into public.user_dealbreakers (user_id, rule_type, target_value, created_at)
    select p_new_id, rule_type, target_value, created_at
    from public.user_dealbreakers where user_id = v_old.id
    on conflict (user_id, rule_type, target_value) do nothing;
    delete from public.user_dealbreakers where user_id = v_old.id;

    -- Mood/genre affinities (PK user + mood + genre)
    insert into public.user_mood_genre_affinities (user_id, mood_id, genre_id, affinity_weight, fatigue, consecutive_listens, last_listened_at)
    select p_new_id, mood_id, genre_id, affinity_weight, fatigue, consecutive_listens, last_listened_at
    from public.user_mood_genre_affinities where user_id = v_old.id
    on conflict (user_id, mood_id, genre_id) do nothing;
    delete from public.user_mood_genre_affinities where user_id = v_old.id;

    -- Text-typed user references
    update public.track_genre_flags t set user_id = p_new_id::text
    where t.user_id = v_old.id::text
      and not exists (select 1 from public.track_genre_flags x where x.track_id = t.track_id and x.user_id = p_new_id::text);
    update public.feedback set user_id = p_new_id::text where user_id = v_old.id::text;

    -- Carry over role, class and calibration from the legacy profile
    update public.user_profiles n set
        role            = coalesce(v_old.role, n.role),
        user_class      = case when v_old.user_class is not null and v_old.user_class <> 'guest' then v_old.user_class else n.user_class end,
        calibration     = case when coalesce(n.calibration, '{}'::jsonb) = '{}'::jsonb then v_old.calibration else n.calibration end,
        discovery_level = coalesce(v_old.discovery_level, n.discovery_level),
        username        = coalesce(n.username, v_old.username),
        avatar_url      = coalesce(n.avatar_url, v_old.avatar_url),
        updated_at      = now()
    where n.id = p_new_id;

    -- Remove the legacy row (frees the unique google_id for the new profile)
    delete from public.user_profiles where id = v_old.id;
end;
$$;

revoke execute on function public.claim_legacy_profile(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. New auth user -> profile row (Google sign-up or anonymous guest)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_guest boolean := coalesce(new.is_anonymous, false);
begin
    insert into public.user_profiles (id, email, username, avatar_url, is_guest, role, user_class, discovery_level, calibration, created_at, updated_at)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', case when v_guest then 'Guest Listener' end),
        coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
        v_guest,
        'user',
        case when v_guest then 'guest' else 'regular' end,
        0.50,
        '{}'::jsonb,
        now(),
        now()
    )
    on conflict (id) do nothing;
    return new;
exception when others then
    -- Never block sign-up; get_my_profile() recreates a missing profile.
    raise warning 'handle_new_auth_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 3. Google identity attached (first Google sign-in, or guest -> Google link)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_google_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_sub text := coalesce(new.identity_data->>'sub', new.provider_id);
begin
    if new.provider <> 'google' then
        return new;
    end if;

    -- Make sure the profile exists (identity rows are inserted after the user row)
    insert into public.user_profiles (id, is_guest, role, user_class, discovery_level, calibration, created_at, updated_at)
    values (new.user_id, false, 'user', 'regular', 0.50, '{}'::jsonb, now(), now())
    on conflict (id) do nothing;

    -- Merge the legacy (pre-Supabase-Auth) profile for this Google account, if any
    perform public.claim_legacy_profile(new.user_id, v_sub);

    update public.user_profiles set
        google_id  = v_sub,
        email      = coalesce(new.identity_data->>'email', email),
        username   = coalesce(new.identity_data->>'full_name', new.identity_data->>'name', username),
        avatar_url = coalesce(new.identity_data->>'avatar_url', new.identity_data->>'picture', avatar_url),
        is_guest   = false,
        user_class = case when user_class = 'guest' then 'regular' else user_class end,
        updated_at = now()
    where id = new.user_id;

    return new;
exception when others then
    raise warning 'handle_new_google_identity failed for %: %', new.user_id, sqlerrm;
    return new;
end;
$$;

revoke execute on function public.handle_new_google_identity() from public, anon, authenticated;

drop trigger if exists on_auth_identity_created_profile on auth.identities;
create trigger on_auth_identity_created_profile
    after insert on auth.identities
    for each row execute function public.handle_new_google_identity();

-- ---------------------------------------------------------------------
-- 4. Clients cannot grant themselves privileges
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    -- Only direct API writes are restricted; SECURITY DEFINER functions and
    -- the service role run as other roles and may set these fields.
    if current_user in ('anon', 'authenticated') then
        if tg_op = 'INSERT' then
            new.role       := 'user';
            new.user_class := case when coalesce(new.is_guest, false) then 'guest' else 'regular' end;
            new.google_id  := null;
        else
            new.id         := old.id;
            new.role       := old.role;
            new.user_class := old.user_class;
            new.google_id  := old.google_id;
            new.is_guest   := old.is_guest;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.user_profiles;
create trigger trg_protect_profile_privileges
    before insert or update on public.user_profiles
    for each row execute function public.protect_profile_privileges();

-- ---------------------------------------------------------------------
-- 5. RPCs for the signed-in user
-- ---------------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_user auth.users%rowtype;
    v_profile public.user_profiles%rowtype;
begin
    if v_uid is null then
        return null;
    end if;

    select * into v_profile from public.user_profiles where id = v_uid;

    if not found then
        -- Self-heal if the sign-up trigger did not run
        select * into v_user from auth.users where id = v_uid;
        insert into public.user_profiles (id, email, username, avatar_url, is_guest, role, user_class, discovery_level, calibration, created_at, updated_at)
        values (
            v_uid,
            v_user.email,
            coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name', case when coalesce(v_user.is_anonymous, false) then 'Guest Listener' end),
            coalesce(v_user.raw_user_meta_data->>'avatar_url', v_user.raw_user_meta_data->>'picture'),
            coalesce(v_user.is_anonymous, false),
            'user',
            case when coalesce(v_user.is_anonymous, false) then 'guest' else 'regular' end,
            0.50, '{}'::jsonb, now(), now()
        )
        on conflict (id) do nothing;
        select * into v_profile from public.user_profiles where id = v_uid;
    end if;

    return jsonb_build_object(
        'id', v_profile.id,
        'username', v_profile.username,
        'email', v_profile.email,
        'avatar_url', v_profile.avatar_url,
        'role', coalesce(v_profile.role, 'user'),
        'user_class', coalesce(v_profile.user_class, 'regular'),
        'is_guest', coalesce(v_profile.is_guest, false),
        'discovery_level', v_profile.discovery_level,
        'calibration', coalesce(v_profile.calibration, '{}'::jsonb)
    );
end;
$$;

revoke execute on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- Helper for admin-only policies (used from Phase 2 onwards)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin');
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
