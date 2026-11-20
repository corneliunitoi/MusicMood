-- Phase 0: the shared guest account's password is in git history (it never signed in).
update auth.users set banned_until = 'infinity'
where id = 'f7337681-6f7b-4772-852f-4d66317d2bb9' and email = 'testguest@gmail.com';

-- Feedback is write-only for clients; read it via the dashboard / service role.
drop policy if exists "Allow select feedback for authenticated" on public.feedback;
revoke select, update, delete on public.feedback from anon, authenticated;
