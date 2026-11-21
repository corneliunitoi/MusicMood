-- artists.track_count drifted (e.g. Pink Floyd 1,064 shown vs 152 real) because scripts wrote
-- summed or incremented values. The database now derives it from the tracks table on every write.
create or replace function public.enforce_artist_track_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    new.track_count := (select count(*) from public.tracks where artist_id = new.id);
    return new;
end;
$$;
revoke execute on function public.enforce_artist_track_count() from public, anon, authenticated;

drop trigger if exists trg_enforce_artist_track_count on public.artists;
create trigger trg_enforce_artist_track_count
    before update of track_count on public.artists
    for each row execute function public.enforce_artist_track_count();

-- One-time recount of every artist whose stored count is wrong
update public.artists a
set track_count = c.n
from (select a2.id, (select count(*) from public.tracks t where t.artist_id = a2.id) as n from public.artists a2) c
where c.id = a.id and a.track_count is distinct from c.n;
