-- A class can now name a backup (substitute) teacher who covers it when the lead teacher is away.
--
-- Its own migration: Postgres cannot use a new enum value in the transaction that adds it, so the
-- index and functions that use 'substitute' are in 20261017000100.

alter type public.class_staff_role add value if not exists 'substitute';

comment on type public.class_staff_role is
  'lead = the class''s main teacher (one per class); substitute = the backup teacher who covers when the lead is away (at most one per class); assistant = a co-teacher, nanny or aide.';
