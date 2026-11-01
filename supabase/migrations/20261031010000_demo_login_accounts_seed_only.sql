-- The login page's demo panel lists only the seed demo accounts (demo-…@xonursery.com).
--
-- get_demo_login_accounts is callable before sign-in. It also listed every staff member onboarded
-- with a placeholder email (@staff.placeholder.xo): real people's names and sign-in addresses, open
-- to anyone. Those staff now get their own first password (staff-onboarding-complete), so the demo
-- password no longer opens their accounts and they have no place in the panel.
-- The panel itself only shows in development, or where VITE_SHOW_DEMO_ACCOUNTS=true.

create or replace function public.get_demo_login_accounts()
returns table (
  email          text,
  name_en        text,
  name_ar        text,
  auth_role      public.user_role,
  custom_role    text,
  position_name  text,
  hr_department  text,
  is_seed_demo   boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    u.email,
    u.name_en,
    u.name_ar,
    u.role as auth_role,
    btrim(coalesce(r.name_en, '')) as custom_role,
    p.name_en as position_name,
    sp.department as hr_department,
    true as is_seed_demo
  from public.users u
  left join public.roles r on r.id = u.role_id
  left join public.staff_profiles sp on sp.user_id = u.id
  left join public.positions p on p.id = sp.position_id
  where u.status = 'active'
    and u.email like 'demo-%@xonursery.com'
  order by u.email;
$$;

revoke all on function public.get_demo_login_accounts() from public;
grant execute on function public.get_demo_login_accounts() to anon, authenticated, service_role;
