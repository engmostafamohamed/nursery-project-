-- Database test · every policy asks who the caller is once per query, not once per row: calls such
-- as current_user_role(), current_user_nursery_id(), is_xo_super_admin(), auth.uid() and user_can
-- with constant arguments are wrapped in (select ...), so the planner runs each one once and compares
-- every row with its answer. Written bare they run again for every row the query reads (migration
-- 20261124100000). Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

-- A bare call: not straight after "SELECT " (the deparsed form of a wrapped one), and not the tail of
-- a longer name.
select is_empty($$
  select tablename || '.' || policyname
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ (
      '(?<!SELECT )(?<!SELECT public\.)(?<![a-z0-9_.])(public\.)?'
      || '(current_user_role|current_user_nursery_id|is_xo_super_admin|current_user_chain_id'
      || '|current_user_department|is_manager_hr|user_can)\('
      || '|(?<!SELECT )auth\.uid\(\)'
    )
  order by 1
$$, 'no policy runs a caller lookup once per row');

-- The check above finds the wrapped form, so it is not passing on text it cannot read.
select cmp_ok(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and qual ~ 'SELECT (public\.)?current_user_role\(\)'),
  '>', 100,
  'the policies read the caller''s role through a sub-select'
);

select * from finish();
rollback;
