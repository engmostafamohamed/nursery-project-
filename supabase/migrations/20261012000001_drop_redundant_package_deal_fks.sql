-- Every `deals(...)` embed from tuition_packages and packages failed with PGRST201 ("more than
-- one relationship was found") after 20261010120000 added the same-nursery composite keys next
-- to the original deal_id keys: signup's payment step, the application's package step and the
-- extra-hours packages could not load.
--
-- The composite keys check strictly more than the single-column ones (the deal exists AND
-- belongs to the package's nursery; nursery_id is NOT NULL on both tables) and keep the same
-- ON DELETE SET NULL (deal_id), so the single-column keys are redundant. Dropping them leaves
-- one relationship per table and the embeds resolve again.

begin;

alter table public.tuition_packages drop constraint if exists tuition_packages_deal_id_fkey;
alter table public.packages drop constraint if exists packages_deal_id_fkey;

notify pgrst, 'reload schema';

commit;
