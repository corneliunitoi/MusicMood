-- Rollback for 20261122_look_setting (v0.8.8d). Drops the Look functions and column.
-- Users' saved Look settings are lost; the app falls back to the copy in each browser.
drop function if exists public.save_my_look(jsonb);
drop function if exists public.get_my_look();
alter table public.user_profiles drop column if exists look;
