-- Parents choose a package from the application form, so they must be able to read the
-- active packages of the nursery the application belongs to. The previous policy only
-- compared against the parent's profile nursery, which hides every package when the
-- profile nursery is missing or differs from the application's nursery (for example an
-- application an admin created from an inquiry).

BEGIN;

DROP POLICY IF EXISTS packages_parent_select ON public.packages;
CREATE POLICY packages_parent_select
  ON public.packages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND active = true
    AND (
      nursery_id = public.current_user_nursery_id()
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        WHERE a.parent_id = auth.uid()
          AND a.nursery_id = packages.nursery_id
      )
    )
  );

COMMIT;
