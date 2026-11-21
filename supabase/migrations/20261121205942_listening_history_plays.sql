-- =====================================================================
-- Phase 3 (v0.8.7f): listening history that describes plays
--   * One row per play: inserted when a track starts, updated with the outcome
--     (listened seconds, completed / skipped / liked / disliked).
--   * Every play is identifiable (youtube_video_id), even without a catalog id.
--   * All 30 app moods exist (22 were missing, incl. Sad and Party: their plays were rejected).
--   * Artist affinity reacts to the outcome update, with guest weighting and rate limits.
-- =====================================================================

-- 1. All app moods (existing rows keep their label/energy)
insert into public.moods (id, label, emoji, search_context) values
    ('happy', 'Happy', '😊', 'upbeat feel good positive'),
    ('sad', 'Sad', '😢', 'sad emotional melancholy heartbreak'),
    ('chill', 'Chill', '🧘', 'relaxing chillout study smooth calm'),
    ('energetic', 'Energetic', '⚡', 'workout intense high energy pump'),
    ('focus', 'Focus', '🧠', 'deep focus concentration instrumental'),
    ('party', 'Party', '🎉', 'party club dance hype'),
    ('late_night', 'Late Night', '🌃', 'late night vibes dark chill'),
    ('driving', 'Roadtrip', '🚗', 'driving road trip singalong cruising'),
    ('workout', 'Workout', '💪', 'gym workout pump hard cardio'),
    ('study', 'Study', '📚', 'study lo-fi beats background reading'),
    ('rainy', 'Rainy Day', '🌧️', 'rainy day acoustic moody chill'),
    ('morning', 'Morning Boost', '🌅', 'morning coffee sunrise uplifting fresh'),
    ('sleep', 'Wind Down', '🌙', 'sleep ambient deep sleep relaxation'),
    ('nostalgic', 'Nostalgic', '📼', 'nostalgic throwback memories'),
    ('romantic', 'Romantic', '💖', 'romantic love songs slow'),
    ('melancholic', 'Melancholic', '🥀', 'melancholic sadness deep thoughts'),
    ('hopeful', 'Hopeful', '🌱', 'hopeful uplifting bright'),
    ('dark_intense', 'Dark/Intense', '🌑', 'dark intense epic heavy'),
    ('dreamy', 'Dreamy', '☁️', 'dreamy ethereal ambient'),
    ('main_character', 'Main Character', '✨', 'main character energy epic pop'),
    ('villain_mode', 'Villain Mode', '😈', 'villain mode dark trap bass'),
    ('soft_vibes', 'Soft Vibes', '🧸', 'soft vibes aesthetic gentle'),
    ('dark_academia', 'Dark Academia', '🏛️', 'dark academia classical instrumental'),
    ('cottagecore', 'Cottagecore', '🍄', 'cottagecore folk acoustic indie'),
    ('cyberpunk', 'Cyberpunk', '🤖', 'cyberpunk synthwave darksynth'),
    ('cinematic_epic', 'Epic', '⚔️', 'epic cinematic orchestral trailer'),
    ('cinematic_mystery', 'Mystery / Noir', '🕵️', 'mystery noir jazz dark ambient'),
    ('cinematic_fantasy', 'Fantasy', '🧝', 'fantasy tavern ambient magical'),
    ('cinematic_scifi', 'Sci-Fi', '🛸', 'sci-fi space ambient electronic'),
    ('cinematic_ambient', 'Ambient', '🌫️', 'ambient soundscape drone relaxing')
on conflict (id) do nothing;

-- 2. New columns
alter table public.listening_history add column if not exists youtube_video_id text;
alter table public.listening_history add column if not exists disliked boolean not null default false;
alter table public.listening_history add column if not exists ended_at timestamptz;
create index if not exists idx_history_video on public.listening_history(youtube_video_id);

-- 3. Users may finish their own plays (outcome columns only)
create policy "Users finish own plays" on public.listening_history
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.listening_history from authenticated;
grant update (listened_seconds, completed, skipped, liked, disliked, ended_at) on public.listening_history to authenticated;

-- 4. Affinity from play outcomes (insert and outcome update), weighted and rate-limited
create or replace function public.history_affinity_delta(p_liked boolean, p_completed boolean, p_skipped boolean, p_disliked boolean)
returns numeric language sql immutable as $$
    select (case when coalesce(p_liked, false) then 5 else 0 end)
         + (case when coalesce(p_completed, false) then 2 else 0 end)
         - (case when coalesce(p_skipped, false) then 2 else 0 end)
         - (case when coalesce(p_disliked, false) then 3 else 0 end);
$$;

create or replace function public.sync_artist_affinity_from_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    v_artist text;
    v_delta numeric;
    v_recent int;
begin
    if tg_op = 'UPDATE' then
        v_delta := public.history_affinity_delta(new.liked, new.completed, new.skipped, new.disliked)
                 - public.history_affinity_delta(old.liked, old.completed, old.skipped, old.disliked);
    else
        v_delta := public.history_affinity_delta(new.liked, new.completed, new.skipped, new.disliked);
    end if;
    if v_delta = 0 then
        return new;
    end if;

    select count(*) into v_recent from public.listening_history
    where user_id = new.user_id and created_at > now() - interval '30 minutes';
    if v_recent > 100 then
        return new;
    end if;

    if new.track_id is not null then
        select artist into v_artist from public.tracks where id = new.track_id;
    elsif new.youtube_video_id is not null then
        select artist into v_artist from public.tracks where youtube_video_id = new.youtube_video_id limit 1;
    end if;
    if v_artist is null then
        return new;
    end if;

    perform public.apply_influence(null, v_artist, 0, v_delta * public.influence_weight(new.user_id));
    return new;
end;
$$;

drop trigger if exists trg_artist_affinity_history on public.listening_history;
create trigger trg_artist_affinity_history
    after insert or update of liked, completed, skipped, disliked on public.listening_history
    for each row execute function public.sync_artist_affinity_from_history();
