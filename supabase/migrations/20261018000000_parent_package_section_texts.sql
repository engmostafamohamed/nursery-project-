-- The nursery's own words above the packages parents choose from, in Arabic and English:
--   parent_payment_intro_*      under the payment section title,
--   parent_tuition_intro_*      above the tuition plans,
--   parent_extra_hours_intro_*  above the extra-hours packages.
-- Empty = the app's standard text. Text the admin typed is data (like package descriptions), so it
-- is stored as written in both languages, not as translation keys.
--
-- set_parent_package_texts() saves them for whoever may manage packages: a branch/chain admin, or
-- staff whose role grants packages:update (the finance manager). The general settings update
-- policies require settings rights, which a finance manager does not have.

begin;

alter table public.nursery_settings
  add column if not exists parent_payment_intro_ar text,
  add column if not exists parent_payment_intro_en text,
  add column if not exists parent_tuition_intro_ar text,
  add column if not exists parent_tuition_intro_en text,
  add column if not exists parent_extra_hours_intro_ar text,
  add column if not exists parent_extra_hours_intro_en text;

alter table public.nursery_settings drop constraint if exists nursery_settings_parent_texts_length;
alter table public.nursery_settings
  add constraint nursery_settings_parent_texts_length check (
    coalesce(char_length(parent_payment_intro_ar), 0) <= 500
    and coalesce(char_length(parent_payment_intro_en), 0) <= 500
    and coalesce(char_length(parent_tuition_intro_ar), 0) <= 500
    and coalesce(char_length(parent_tuition_intro_en), 0) <= 500
    and coalesce(char_length(parent_extra_hours_intro_ar), 0) <= 500
    and coalesce(char_length(parent_extra_hours_intro_en), 0) <= 500
  );

create or replace function public.set_parent_package_texts(
  p_nursery_id uuid,
  p_payment_intro_ar text,
  p_payment_intro_en text,
  p_tuition_intro_ar text,
  p_tuition_intro_en text,
  p_extra_hours_intro_ar text,
  p_extra_hours_intro_en text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u where u.id = v_uid;

  if v_role = 'branch_admin'::public.user_role then
    if v_user_nursery_id is distinct from p_nursery_id then
      raise exception 'parent_texts_forbidden' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin'::public.user_role then
    if v_user_chain_id is null or not exists (
      select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'parent_texts_forbidden' using errcode = '42501';
    end if;
  elsif v_role in ('manager'::public.user_role, 'teacher'::public.user_role) then
    if v_user_nursery_id is distinct from p_nursery_id or not public.user_can('packages', 'update') then
      raise exception 'parent_texts_forbidden' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'parent_texts_forbidden' using errcode = '42501';
  end if;

  update public.nursery_settings
     set parent_payment_intro_ar = nullif(btrim(p_payment_intro_ar), ''),
         parent_payment_intro_en = nullif(btrim(p_payment_intro_en), ''),
         parent_tuition_intro_ar = nullif(btrim(p_tuition_intro_ar), ''),
         parent_tuition_intro_en = nullif(btrim(p_tuition_intro_en), ''),
         parent_extra_hours_intro_ar = nullif(btrim(p_extra_hours_intro_ar), ''),
         parent_extra_hours_intro_en = nullif(btrim(p_extra_hours_intro_en), ''),
         updated_at = now()
   where nursery_id = p_nursery_id;

  if not found then
    raise exception 'parent_texts_nursery_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_parent_package_texts(uuid, text, text, text, text, text, text) from public;
grant execute on function public.set_parent_package_texts(uuid, text, text, text, text, text, text) to authenticated;

commit;
