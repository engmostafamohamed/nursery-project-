-- A deal can only be assigned to a package owned by the same nursery. The UI scopes
-- deal choices by nursery, but enforce this relationship in the database as well.

begin;

do $$
begin
  if exists (
    select 1
    from public.tuition_packages tp
    join public.deals d on d.id = tp.deal_id
    where tp.nursery_id <> d.nursery_id
  ) or exists (
    select 1
    from public.packages p
    join public.deals d on d.id = p.deal_id
    where p.nursery_id <> d.nursery_id
  ) then
    raise exception 'Packages are assigned to deals from another nursery; reconcile those assignments before applying this migration';
  end if;
end;
$$;

create unique index if not exists deals_nursery_id_id_uniq
  on public.deals (nursery_id, id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tuition_packages'::regclass
      and conname = 'tuition_packages_deal_same_nursery_fk'
  ) then
    alter table public.tuition_packages
      add constraint tuition_packages_deal_same_nursery_fk
      foreign key (nursery_id, deal_id)
      references public.deals (nursery_id, id)
      on delete set null (deal_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.packages'::regclass
      and conname = 'packages_deal_same_nursery_fk'
  ) then
    alter table public.packages
      add constraint packages_deal_same_nursery_fk
      foreign key (nursery_id, deal_id)
      references public.deals (nursery_id, id)
      on delete set null (deal_id);
  end if;
end;
$$;

commit;
