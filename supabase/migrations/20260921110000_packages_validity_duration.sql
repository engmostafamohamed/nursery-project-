-- Extra-hours packages currently never expire once assigned. Let the admin give a
-- package a validity period (N months or N years); child_packages then stores the
-- computed expiry so coverage can lapse automatically instead of running forever.

begin;

alter table public.packages
  add column if not exists validity_value integer,
  add column if not exists validity_unit text check (validity_unit in ('months', 'years'));

alter table public.packages
  add constraint packages_validity_pair_ck
  check (
    (validity_value is null and validity_unit is null)
    or (validity_value is not null and validity_value > 0 and validity_unit is not null)
  );

comment on column public.packages.validity_value is 'How many months/years this package stays active once assigned. NULL = never expires.';
comment on column public.packages.validity_unit is 'Unit for validity_value: months or years. NULL when validity_value is NULL.';

alter table public.child_packages
  add column if not exists expires_at timestamptz;

comment on column public.child_packages.expires_at is 'Computed at assignment from the package''s validity_value/validity_unit. NULL = never expires.';

-- Recomputes expires_at from the package's current validity whenever a child_packages
-- row is inserted or reassigned to a different package.
create or replace function public.child_packages_set_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validity_value integer;
  v_validity_unit text;
begin
  select validity_value, validity_unit
    into v_validity_value, v_validity_unit
  from public.packages
  where id = new.package_id;

  if v_validity_value is null then
    new.expires_at := null;
  elsif v_validity_unit = 'years' then
    new.expires_at := new.assigned_at + make_interval(years => v_validity_value);
  else
    new.expires_at := new.assigned_at + make_interval(months => v_validity_value);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_child_packages_set_expiry on public.child_packages;
create trigger trg_child_packages_set_expiry
  before insert on public.child_packages
  for each row execute function public.child_packages_set_expiry();

-- Backfill: existing active assignments get an expiry if their package already has a
-- validity period (freshly added above, so today this only matters going forward, but
-- keeps behavior consistent for any package created with validity before assignment).
update public.child_packages cp
   set expires_at = cp.assigned_at + make_interval(years => p.validity_value)
  from public.packages p
 where p.id = cp.package_id
   and p.validity_unit = 'years'
   and cp.expires_at is null;

update public.child_packages cp
   set expires_at = cp.assigned_at + make_interval(months => p.validity_value)
  from public.packages p
 where p.id = cp.package_id
   and p.validity_unit = 'months'
   and cp.expires_at is null;

-- A package's coverage no longer applies once it has expired, even if status is still
-- 'active' (nothing flips status automatically — this just stops it from being used).
create or replace function public.package_apply_extra_hours(
  p_child_id   uuid,
  p_extra_hours numeric,
  p_consume    boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  cp        public.child_packages%rowtype;
  pkg       public.packages%rowtype;
  remaining numeric;
  covered   numeric := 0;
begin
  if p_extra_hours is null or p_extra_hours <= 0 then
    return 0;
  end if;

  select * into cp
  from public.child_packages
  where child_id = p_child_id and status = 'active'
  limit 1;
  if not found then
    return 0;
  end if;

  if cp.expires_at is not null and cp.expires_at <= now() then
    return 0;
  end if;

  select * into pkg from public.packages where id = cp.package_id;
  if not found or not pkg.active then
    return 0;
  end if;

  if pkg.coverage_type = 'unlimited' then
    return p_extra_hours;
  end if;

  remaining := greatest(coalesce(pkg.included_hours, 0) - cp.hours_used, 0);
  covered := least(p_extra_hours, remaining);

  if p_consume and covered > 0 then
    update public.child_packages
       set hours_used = hours_used + covered
     where id = cp.id;
  end if;

  return covered;
end;
$$;

commit;
