-- Phase 0: RLS does not apply to TRUNCATE, so these grants let anyone holding the
-- publishable key empty any public table. The app never uses these privileges.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
