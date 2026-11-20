-- Phase 0: stop new tables (created by the postgres role) from re-granting these privileges.
alter default privileges for role postgres in schema public
    revoke truncate, trigger, references on tables from anon, authenticated;
