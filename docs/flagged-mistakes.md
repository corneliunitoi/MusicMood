# Flagged mistakes log

Every time the owner flags a wrong genre (the flag button writes to `track_genre_flags`) or a song that will not play
(`track_playback_reports`), we review it, record it here, name the pattern and turn repeated patterns into rules.
The goal: fix causes, not single songs.

**Review routine (each time flags are mentioned):**
1. Read the new flags with their song, artist, catalog genre and `source` (query below).
2. Decide what the song really is. Put it in the table with a pattern code.
3. If a pattern repeats, write or update a rule, fix the cause in code, and record the version.
4. Mark handled flags `resolved` in `track_genre_flags` (`status`, `resolved_genre_id`) so the next batch is only new ones.

```sql
select g.created_at, t.title, t.artist, t.primary_genre_id, t.source, g.status
from public.track_genre_flags g join public.tracks t on t.id = g.track_id
where g.status = 'pending' order by g.created_at desc;
```

## Patterns and rules

| Code | Pattern | Rule | Status |
| :--- | :--- | :--- | :--- |
| **P1** | A song is filed under a genre because its **title** contains the genre's words ("Storm" under Quiet Storm, "Classical", "Noble Folk"). Cause: the just-in-time MusicBrainz search sent `tag:quiet storm` unquoted, so the 2nd word searched song titles. | Never infer a genre from a song title. Quote multi-word MusicBrainz tags (`tag:"quiet storm"`) and drop results whose title is only the genre's words. | **Fixed in 0.9.0s** (`buildTagQuery`, `titleIsJustGenreWords`, unit tested). Existing rows still to clean. |
| **P2** | A multi-genre artist is filed by one broad artist tag (Beck under Indie Folk). | Artists whose catalog spans genres need a per-song check or an entry in `ARTIST_CANONICAL_GENRES`; don't let one artist-level tag decide every song. | Open. |
| **P3** | Look-alike genres leak into gentle ones (folk **metal** under Acoustic Folk). | Harvests use `rejectGenres` (metal, punk, industrial, pop...) for every gap-fill genre. | **Added in 0.9.0s** for new harvests. Old rows still to review. |
| **P4** | Granularity: performer-led classical filed as *contemporary* classical (a Granados piece). | Contemporary classical = composed after about 1950 (minimalism, modern). Older repertoire goes to romantic / classical_period / baroque by composer era. | Open. |
| **P5** | The same song is wrongly filed in two sibling genres, e.g. `bossa_nova` and `bossa_nova_jazz`, `folk_acoustic` and `acoustic_folk`. | Decide one genre per sound, or document the difference. | Open (taxonomy review). |
| **P7** | Tag-seeded imports file loosely related songs under a niche genre: `nature_soundscape` holds mostly ambient music (Brian Eno, GAS) and a Beethoven movement with the wrong artist ("No. 2 in D minor"); `pfunk` holds unrelated funk-tagged artists (Bibio, Tom Browne, "The Music of A. Craze"). | Niche genres need a required-tag check (`forceTags`), look-alike filters, and for nature sounds a length cap. | **Addressed for new imports in 0.9.0u.** Existing rows still to review. |
| **P6** | Playback error 150 (video does not allow embedding) and hand-typed video ids in seed scripts. | After error 150/101 find another upload automatically; never type video ids by hand. | Open. |

## Batch 1: 2026-11-23, ten genre flags from the owner

All ten are still `pending` in the database when this was written.

| Song | Artist | Filed as | Source | What it really is | Pattern |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Jack-Ass (Lowrider mix by Butch Vig) | Beck | indie_folk | musicbrainz_seed | Alt-rock / lo-fi hip-hop collage | P2 |
| Classical | Austin Sour | classical | jit_musicbrainz | Not classical (title match) | P1 |
| Classical | Ian Masterson | classical | jit_musicbrainz | Not classical (title match) | P1 |
| Classical | Busy Boys | classical | jit_musicbrainz | Not classical (title match) | P1 |
| El majo discreto | Kim Kashkashian | contemporary_classical | musicbrainz-fast-pull | Granados, late-Romantic repertoire | P4 |
| Cavalry Folk | Tengger Cavalry | acoustic_folk | jit_musicbrainz | Mongolian folk **metal** | P1 + P3 |
| Noble Folk | Grim | acoustic_folk | jit_musicbrainz | Not folk (title match) | P1 |
| Storm | Catamenia | quiet_storm | jit_musicbrainz | Finnish melodic black metal | P1 + P3 |
| Storm | Ashes | quiet_storm | jit_musicbrainz | Not R&B (title match) | P1 |
| Storm Fervish Storm | Jaime Munárriz | quiet_storm | jit_musicbrainz | Not R&B (title match) | P1 |

**Scale of P1:** `jit_musicbrainz` has 770 songs, 117 added in the last 24 hours. 35 have a title that is exactly a genre
word, and about 40 more have a genre word in the title under that genre (Quiet Storm 11, folk 17, classical 12). Cleaning these
is a separate decision for the owner: delete them, or re-file them after a check.

### Playback reports (error 150) seen so far
14 reports, all error 150 (embedding blocked or unavailable), e.g. Perturbator "She Does Not Choke" and Carpenter Brut "Turbo Killer"
(the first has a video id that looks hand-typed), D'Angelo "Brown Sugar", Cameo "Funk Funk", Bootsy's Rubber Band "Bootzilla",
Charlie Byrd "O Pato". Pattern P6.

### Suspected misfiles spotted in the owner's likes (not flagged, to verify)
Liked inside a genre but probably a different sound: Tom Verlaine and Tower of Power (in quiet_storm); Roy Orbison and two Japanese
jazz trios (in soul_blues); Taylor Swift (in indie_folk); Alphaville and Let's Eat Grandma (in darksynth). Nobody has flagged these
yet; check them before drawing rules.
