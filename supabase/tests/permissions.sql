-- =====================================================================
-- Permission regression test (v0.8.8)
-- Simulates a guest, a signed-in user, an admin and a no-session visitor,
-- checks what each may do, and FAILS (raises) if any rule has regressed.
-- Everything runs in one transaction and is rolled back: no data changes.
--
-- Run:  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql
-- (CI: the "Database permissions" workflow, when the SUPABASE_DB_URL secret is set)
-- =====================================================================
begin;

create temp table perm_results (who text, action text, expected text, actual text);
grant all on perm_results to anon, authenticated;

-- Fixtures
insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true,  now(), now()),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now()),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', false, now(), now());
update public.user_profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000c001';

create temp table fx as select
  (select id from public.tracks where youtube_video_id is not null limit 1) as mapped_track,
  (select youtube_video_id from public.tracks where youtube_video_id is not null limit 1) as mapped_video,
  (select id from public.artists limit 1) as artist,
  (select id from public.artist_suggestions limit 1) as suggestion;
grant select on fx to anon, authenticated;

-- A favorite owned by the signed-in user, to test that others cannot read it
insert into public.user_favorites (user_id, video_id, title, artist)
values ('00000000-0000-4000-8000-00000000b001', 'permtest001', 'Private Song', 'Private Artist');

-- ---------------------------------------------------------------------
-- Guest (anonymous Supabase user)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a001","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;
do $$
declare n int; v uuid; r jsonb;
begin
  begin insert into public.tracks (title, artist, youtube_video_id, source) values ('__perm__', '__perm__', 'permtest002', 'test');
        insert into perm_results values ('guest', 'add a track', 'allowed', 'allowed');
  exception when others then insert into perm_results values ('guest', 'add a track', 'allowed', 'blocked'); end;

  begin update public.tracks set youtube_video_id = 'hijackvid01' where id = (select mapped_track from fx); get diagnostics n = row_count;
        insert into perm_results values ('guest', 'change an existing video', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into perm_results values ('guest', 'change an existing video', 'blocked', 'blocked'); end;

  delete from public.tracks where id = (select mapped_track from fx); get diagnostics n = row_count;
  insert into perm_results values ('guest', 'delete a track', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);

  begin update public.artists set name = name where id = (select artist from fx); get diagnostics n = row_count;
        insert into perm_results values ('guest', 'edit an artist', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into perm_results values ('guest', 'edit an artist', 'blocked', 'blocked'); end;

  delete from public.artist_suggestions where id = (select suggestion from fx); get diagnostics n = row_count;
  insert into perm_results values ('guest', 'delete a staged artist', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);

  begin insert into public.track_genre_flags (track_id, user_id, status) values ((select mapped_track from fx), 'someone-else', 'pending');
        insert into perm_results values ('guest', 'flag as another user', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('guest', 'flag as another user', 'blocked', 'blocked'); end;

  begin update public.user_profiles set role = 'admin' where id = auth.uid(); exception when others then null; end;
  insert into perm_results values ('guest', 'promote self to admin', 'blocked',
    case when (select role from public.user_profiles where id = auth.uid()) = 'admin' then 'allowed' else 'blocked' end);

  select count(*) into n from public.user_profiles where id <> auth.uid();
  insert into perm_results values ('guest', 'read other profiles', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);

  select jsonb_array_length(public.get_user_favorites('00000000-0000-4000-8000-00000000b001')) into n;
  insert into perm_results values ('guest', 'read another user''s favorites (RPC)', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);

  select count(*) into n from public.listening_history where user_id <> auth.uid();
  insert into perm_results values ('guest', 'read others'' listening history', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);

  r := public.save_my_look('{"mode":"fixed","fixed":"rainy","off":[]}');
  insert into perm_results values ('guest', 'save own Look setting', 'allowed',
    case when r->>'success' = 'true' and public.get_my_look()->>'fixed' = 'rainy' then 'allowed' else 'blocked' end);

  r := public.upvote_track((select mapped_video from fx), 'x', 1);
  insert into perm_results values ('guest', 'upvote a track', 'allowed', case when r->>'status' = 'voted' then 'allowed' else 'blocked' end);
  r := public.upvote_track((select mapped_video from fx), 'x', 1000000);
  insert into perm_results values ('guest', 'vote twice on the same track', 'blocked', case when r->>'status' = 'voted' then 'allowed' else 'blocked' end);
  insert into perm_results values ('guest', 'vote weight is 0.25', 'allowed',
    case when (select weight from public.user_upvotes where user_id = auth.uid()) = 0.25 then 'allowed' else 'blocked' end);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update public.artist_suggestions set status = status where id = (select suggestion from fx); get diagnostics n = row_count;
  insert into perm_results values ('admin', 'moderate a staged artist', 'allowed', case when n > 0 then 'allowed' else 'blocked' end);
  delete from public.tracks where id = (select mapped_track from fx); get diagnostics n = row_count;
  insert into perm_results values ('admin', 'delete a track', 'allowed', case when n > 0 then 'allowed' else 'blocked' end);
  -- The guest saved a Look above; get_my_look must only ever return the caller's own setting.
  insert into perm_results values ('admin', 'read another user''s Look setting', 'blocked',
    case when public.get_my_look() is not null then 'allowed' else 'blocked' end);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- No session (publishable key only)
-- ---------------------------------------------------------------------
set local role anon;
do $$
declare n int;
begin
  begin insert into public.tracks (title, artist, source) values ('__anon__', '__anon__', 't');
        insert into perm_results values ('anon', 'add a track', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('anon', 'add a track', 'blocked', 'blocked'); end;

  begin select count(*) into n from public.listening_history;
        insert into perm_results values ('anon', 'read listening history', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into perm_results values ('anon', 'read listening history', 'blocked', 'blocked'); end;

  begin select count(*) into n from public.user_profiles;
        insert into perm_results values ('anon', 'read user profiles', 'blocked', case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into perm_results values ('anon', 'read user profiles', 'blocked', 'blocked'); end;

  begin perform public.upvote_track('x', 'y', 1);
        insert into perm_results values ('anon', 'upvote', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('anon', 'upvote', 'blocked', 'blocked'); end;

  begin insert into public.feedback (name, comment) values ('perm', 'perm');
        insert into perm_results values ('anon', 'send feedback', 'allowed', 'allowed');
  exception when others then insert into perm_results values ('anon', 'send feedback', 'allowed', 'blocked'); end;

  begin select count(*) into n from public.tracks;
        insert into perm_results values ('anon', 'read the catalog', 'allowed', case when n > 0 then 'allowed' else 'blocked' end);
  exception when others then insert into perm_results values ('anon', 'read the catalog', 'allowed', 'blocked'); end;

  begin perform public.save_my_look('{"mode":"auto","fixed":"classic","off":[]}');
        insert into perm_results values ('anon', 'save a Look setting', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('anon', 'save a Look setting', 'blocked', 'blocked'); end;

  begin update public.tracks set title = title where id = (select mapped_track from fx);
        insert into perm_results values ('anon', 'edit the catalog', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('anon', 'edit the catalog', 'blocked', 'blocked'); end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Abuse limits (v0.9.0k): per-account insert limits, feedback limits, safe video-id fill
-- ---------------------------------------------------------------------
insert into public.tracks (title, artist, youtube_video_id, source) values ('__perm_fill__', 'Perm Real Artist', null, 'test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000a002","role":"authenticated","is_anonymous":true}', true);
set local role authenticated;
do $$
declare ok int := 0; i int; a text; v text;
begin
  for i in 1..65 loop
    begin insert into public.tracks (title, artist, youtube_video_id, source) values ('__perm_q__' || i, '__perm_qa__', 'pq' || lpad(i::text, 9, '0'), 'test'); ok := ok + 1;
    exception when others then null; end;
  end loop;
  insert into perm_results values ('guest', 'add more than 60 tracks in an hour', 'blocked', case when ok > 60 then 'allowed' else 'blocked' end);

  begin insert into public.tracks (title, artist, youtube_video_id, source) values ('x', 'y', 'not-valid', 'test');
        insert into perm_results values ('guest', 'add a track with a malformed video id', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('guest', 'add a track with a malformed video id', 'blocked', 'blocked'); end;

  begin insert into public.feedback (user_id, name, comment) values (null, 'perm', repeat('x', 2001));
        insert into perm_results values ('guest', 'send a 2001-character feedback', 'blocked', 'allowed');
  exception when others then insert into perm_results values ('guest', 'send a 2001-character feedback', 'blocked', 'blocked'); end;

  update public.tracks set youtube_video_id = 'permfill001', artist = 'Hacked' where title = '__perm_fill__';
  select artist, youtube_video_id into a, v from public.tracks where title = '__perm_fill__';
  insert into perm_results values ('guest', 'rename a real artist while filling a video id', 'blocked', case when a = 'Hacked' then 'allowed' else 'blocked' end);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Report and fail on any regression
-- ---------------------------------------------------------------------
do $$
declare failures text;
begin
  select string_agg(who || ': ' || action || ' (expected ' || expected || ', got ' || actual || ')', '; ')
  into failures from perm_results where expected <> actual;
  if failures is not null then
    raise exception 'Permission regression: %', failures;
  end if;
  raise notice 'All % permission checks passed', (select count(*) from perm_results);
end $$;

select who, action, expected, actual, case when expected = actual then 'PASS' else 'FAIL' end as result
from perm_results order by who, action;

rollback;
