-- Security: a username no longer gives away a family's email.
--
-- auth_email_for_username answered anyone, signed in or not, with the email of the parent who has a
-- username: guessing usernames harvested the families' addresses. It was only there for accounts
-- made before usernames, whose sign-in address is their real email. Since then a family signs in
-- with its username, whose sign-in address is made from it (<username>@parents.xo.local), so the
-- app builds that address itself; an older account signs in with its email, as it always could.

drop function if exists public.auth_email_for_username(text);
