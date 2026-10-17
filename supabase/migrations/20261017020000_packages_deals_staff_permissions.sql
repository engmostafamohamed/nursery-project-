-- Managers (and custom staff roles) get the package and deal access their role grants.
--
-- The app already lets a finance manager open Packages and Deals: role_features gives
-- manager_finance view/create/update/delete on 'packages' and 'deals' (operations managers: view
-- packages). But these tables only had admin policies plus a read-only staff policy, so every save
-- a finance manager made failed, and extra-hours `packages` had no manager policy at all (the
-- list showed empty). These policies follow the invoices_perm_* pattern: staff of the nursery,
-- allowed by public.user_can(feature, action), which reads the same role_features the app uses.
--
-- The tuition package editor upserts billing periods (insert ... on conflict do update), so those
-- need insert and update together; assigning a child to an extra-hours package writes
-- child_packages under the 'packages' feature too.

begin;

do $$
declare
  t record;
  a record;
  v_check text;
begin
  for t in
    select * from (values
      ('packages', 'packages'),
      ('tuition_packages', 'packages'),
      ('tuition_package_billing_periods', 'packages'),
      ('child_packages', 'packages'),
      ('deals', 'deals')
    ) as v(tbl, feature)
  loop
    for a in
      select * from (values ('select', 'view'), ('insert', 'create'), ('update', 'update'), ('delete', 'delete')) as v(cmd, action)
    loop
      v_check := format(
        $f$public.current_user_role() = any (array['manager'::public.user_role, 'teacher'::public.user_role])
           and nursery_id = public.current_user_nursery_id()
           and public.user_can(%L, %L)$f$,
        t.feature,
        a.action
      );
      execute format('drop policy if exists %I on public.%I', t.tbl || '_perm_' || a.cmd, t.tbl);
      execute format(
        'create policy %I on public.%I for %s to authenticated %s',
        t.tbl || '_perm_' || a.cmd,
        t.tbl,
        a.cmd,
        case a.cmd
          when 'insert' then format('with check (%s)', v_check)
          when 'update' then format('using (%s) with check (%s)', v_check, v_check)
          else format('using (%s)', v_check)
        end
      );
    end loop;
  end loop;
end
$$;

commit;
