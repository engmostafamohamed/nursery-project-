begin;

do $$
begin
  if exists (
    select 1
    from public.staff_payroll
    group by nursery_id, staff_id, pay_period_start
    having count(*) > 1
  ) then
    raise exception 'Duplicate staff payroll rows exist; reconcile them before applying payroll idempotency';
  end if;
end;
$$;

create unique index if not exists staff_payroll_nursery_staff_period_uniq
  on public.staff_payroll (nursery_id, staff_id, pay_period_start);

alter table public.staff_payroll
  add column if not exists payment_idempotency_key uuid;

create unique index if not exists staff_payroll_payment_idempotency_key_uniq
  on public.staff_payroll (payment_idempotency_key)
  where payment_idempotency_key is not null;

create table if not exists public.staff_payroll_operations (
  idempotency_key uuid primary key,
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  operation text not null check (operation in ('create', 'generate_month', 'mark_paid', 'mark_month_paid')),
  request jsonb not null,
  result jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.staff_payroll_operations enable row level security;
revoke all on public.staff_payroll_operations from public, anon, authenticated;

create or replace function public.staff_payroll_begin_operation(
  p_idempotency_key uuid,
  p_nursery_id uuid,
  p_operation text,
  p_request jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.staff_payroll_operations%rowtype;
  v_inserted integer;
begin
  if p_idempotency_key is null then
    raise exception 'payroll_idempotency_key_required' using errcode = '22023';
  end if;

  insert into public.staff_payroll_operations (idempotency_key, nursery_id, operation, request, created_by)
  values (p_idempotency_key, p_nursery_id, p_operation, p_request, p_actor_id)
  on conflict (idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return null;
  end if;

  select *
    into v_operation
    from public.staff_payroll_operations
   where idempotency_key = p_idempotency_key
   for update;

  if v_operation.nursery_id is distinct from p_nursery_id
     or v_operation.operation is distinct from p_operation
     or v_operation.request is distinct from p_request then
    raise exception 'payroll_idempotency_key_reused' using errcode = '22023';
  end if;
  if v_operation.result is null then
    raise exception 'payroll_operation_incomplete' using errcode = 'P0001';
  end if;
  return v_operation.result;
end;
$$;

create or replace function public.staff_payroll_finish_operation(
  p_idempotency_key uuid,
  p_result jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff_payroll_operations
     set result = p_result
   where idempotency_key = p_idempotency_key
$$;

create or replace function public.staff_payroll_require_permission(
  p_nursery_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_nursery_id uuid;
  v_chain_id uuid;
begin
  if v_uid is null then
    raise exception 'payroll_not_authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id
    into v_role, v_nursery_id, v_chain_id
    from public.users u
   where u.id = v_uid;

  if v_role is null then
    raise exception 'payroll_user_not_found' using errcode = '42501';
  end if;

  if v_role = 'xo_super_admin' then
    return v_uid;
  elsif v_role = 'branch_admin' then
    if v_nursery_id is not distinct from p_nursery_id then
      return v_uid;
    end if;
  elsif v_role = 'chain_super_admin' then
    if v_chain_id is not null and exists (
      select 1
        from public.nurseries n
       where n.id = p_nursery_id
         and n.chain_id = v_chain_id
    ) then
      return v_uid;
    end if;
  elsif v_role in ('manager', 'teacher') then
    if v_nursery_id is not distinct from p_nursery_id
       and public.user_can('payroll', p_action) then
      return v_uid;
    end if;
  end if;

  raise exception 'payroll_forbidden' using errcode = '42501';
end;
$$;

create or replace function public.create_staff_payroll(
  p_staff_id uuid,
  p_nursery_id uuid,
  p_pay_period_start date,
  p_pay_period_end date,
  p_base_salary numeric,
  p_bonuses numeric,
  p_deductions numeric,
  p_payment_method text,
  p_notes text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid;
  v_cached jsonb;
  v_result jsonb;
  v_payroll_id uuid;
  v_existing public.staff_payroll%rowtype;
  v_request jsonb;
begin
  v_uid := public.staff_payroll_require_permission(p_nursery_id, 'create');

  if p_pay_period_start is null or p_pay_period_end is null or p_pay_period_start > p_pay_period_end then
    raise exception 'payroll_invalid_period' using errcode = '22023';
  end if;
  if p_base_salary is null or p_bonuses is null or p_deductions is null
     or p_base_salary < 0 or p_bonuses < 0 or p_deductions < 0
     or p_base_salary + p_bonuses < p_deductions then
    raise exception 'payroll_invalid_amount' using errcode = '22023';
  end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'check') then
    raise exception 'payroll_invalid_method' using errcode = '22023';
  end if;
  v_request := jsonb_build_object(
    'staff_id', p_staff_id,
    'pay_period_start', p_pay_period_start,
    'pay_period_end', p_pay_period_end,
    'base_salary', round(p_base_salary, 2),
    'bonuses', round(p_bonuses, 2),
    'deductions', round(p_deductions, 2),
    'payment_method', p_payment_method,
    'notes', p_notes
  );
  v_cached := public.staff_payroll_begin_operation(
    p_idempotency_key, p_nursery_id, 'create', v_request, v_uid
  );
  if v_cached is not null then
    return v_cached;
  end if;

  if not exists (
    select 1
      from public.staff_profiles sp
     where sp.id = p_staff_id
       and sp.nursery_id = p_nursery_id
  ) then
    raise exception 'payroll_staff_wrong_nursery' using errcode = '42501';
  end if;

  insert into public.staff_payroll (
    staff_id, nursery_id, pay_period_start, pay_period_end,
    base_salary, bonuses, deductions, payment_method, payment_status,
    notes, created_by, payslip_url
  )
  values (
    p_staff_id, p_nursery_id, p_pay_period_start, p_pay_period_end,
    round(p_base_salary, 2), round(p_bonuses, 2), round(p_deductions, 2),
    p_payment_method, 'pending', nullif(trim(coalesce(p_notes, '')), ''),
    v_uid, 'pending://phase20-pdf'
  )
  on conflict (nursery_id, staff_id, pay_period_start) do nothing
  returning id into v_payroll_id;

  if v_payroll_id is null then
    select *
      into v_existing
      from public.staff_payroll
     where nursery_id = p_nursery_id
       and staff_id = p_staff_id
       and pay_period_start = p_pay_period_start
     for update;
    if v_existing.pay_period_end is distinct from p_pay_period_end
       or v_existing.base_salary is distinct from round(p_base_salary, 2)
       or v_existing.bonuses is distinct from round(p_bonuses, 2)
       or v_existing.deductions is distinct from round(p_deductions, 2)
       or v_existing.payment_method is distinct from p_payment_method
       or v_existing.notes is distinct from nullif(trim(coalesce(p_notes, '')), '') then
      raise exception 'payroll_period_exists' using errcode = '23505';
    end if;
    v_payroll_id := v_existing.id;
    v_result := jsonb_build_object('status', 'duplicate', 'payroll_id', v_payroll_id);
  else
    v_result := jsonb_build_object('status', 'created', 'payroll_id', v_payroll_id);
  end if;

  perform public.staff_payroll_finish_operation(p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.generate_monthly_staff_payroll(
  p_nursery_id uuid,
  p_month date,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid;
  v_cached jsonb;
  v_result jsonb;
  v_end date;
  v_created integer;
begin
  v_uid := public.staff_payroll_require_permission(p_nursery_id, 'create');
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'payroll_invalid_period' using errcode = '22023';
  end if;
  v_end := (p_month + interval '1 month' - interval '1 day')::date;

  v_cached := public.staff_payroll_begin_operation(
    p_idempotency_key,
    p_nursery_id,
    'generate_month',
    jsonb_build_object('month', p_month),
    v_uid
  );
  if v_cached is not null then
    return v_cached;
  end if;

  if exists (
    select 1
      from public.staff_profiles sp
      join public.users u on u.id = sp.user_id
     where sp.nursery_id = p_nursery_id
       and u.status = 'active'
       and coalesce(sp.salary_amount, 0) < 0
  ) then
    raise exception 'payroll_invalid_salary_data' using errcode = '22023';
  end if;

  insert into public.staff_payroll (
    staff_id, nursery_id, pay_period_start, pay_period_end,
    base_salary, bonuses, deductions, payment_method, payment_status,
    notes, created_by, payslip_url
  )
  select
    sp.id, p_nursery_id, p_month, v_end,
    round(coalesce(sp.salary_amount, 0), 2), 0, 0,
    'bank_transfer', 'pending', null, v_uid, 'pending://phase20-pdf'
  from public.staff_profiles sp
  join public.users u on u.id = sp.user_id
  where sp.nursery_id = p_nursery_id
    and u.status = 'active'
  on conflict (nursery_id, staff_id, pay_period_start) do nothing;
  get diagnostics v_created = row_count;

  v_result := jsonb_build_object('status', 'generated', 'created_count', v_created);
  perform public.staff_payroll_finish_operation(p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.mark_staff_payroll_paid(
  p_payroll_id uuid,
  p_payment_date date,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid;
  v_cached jsonb;
  v_result jsonb;
  v_payroll public.staff_payroll%rowtype;
  v_staff_user_id uuid;
begin
  select *
    into v_payroll
    from public.staff_payroll
   where id = p_payroll_id
   for update;
  if not found then
    raise exception 'payroll_record_not_found' using errcode = 'P0002';
  end if;
  v_uid := public.staff_payroll_require_permission(v_payroll.nursery_id, 'approve');

  v_cached := public.staff_payroll_begin_operation(
    p_idempotency_key,
    v_payroll.nursery_id,
    'mark_paid',
    jsonb_build_object('payroll_id', p_payroll_id, 'payment_date', coalesce(p_payment_date, current_date)),
    v_uid
  );
  if v_cached is not null then
    return v_cached;
  end if;

  if v_payroll.payment_status = 'paid' then
    v_result := jsonb_build_object('status', 'already_paid', 'payroll_id', p_payroll_id);
  else
    update public.staff_payroll
       set payment_status = 'paid',
           payment_date = coalesce(p_payment_date, current_date),
           paid_by = v_uid,
           payment_idempotency_key = p_idempotency_key
     where id = p_payroll_id
       and payment_status = 'pending';

    select sp.user_id
      into v_staff_user_id
      from public.staff_profiles sp
     where sp.id = v_payroll.staff_id;
    if v_staff_user_id is not null then
      perform public.notify_users(
        array[v_staff_user_id],
        v_payroll.nursery_id,
        'staff_payroll_paid',
        'staff_payroll_paid',
        jsonb_build_object(
          'month', to_char(v_payroll.pay_period_start, 'YYYY-MM'),
          'amount', v_payroll.total_amount,
          'currency', 'EGP'
        ),
        '/staff/payslips'
      );
    end if;
    v_result := jsonb_build_object('status', 'paid', 'payroll_id', p_payroll_id);
  end if;

  perform public.staff_payroll_finish_operation(p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.mark_month_staff_payroll_paid(
  p_nursery_id uuid,
  p_month date,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid;
  v_cached jsonb;
  v_result jsonb;
  v_end date;
  v_payroll record;
  v_staff_user_id uuid;
  v_paid_count integer := 0;
begin
  v_uid := public.staff_payroll_require_permission(p_nursery_id, 'approve');
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'payroll_invalid_period' using errcode = '22023';
  end if;
  v_end := (p_month + interval '1 month' - interval '1 day')::date;

  v_cached := public.staff_payroll_begin_operation(
    p_idempotency_key,
    p_nursery_id,
    'mark_month_paid',
    jsonb_build_object('month', p_month),
    v_uid
  );
  if v_cached is not null then
    return v_cached;
  end if;

  for v_payroll in
    update public.staff_payroll
       set payment_status = 'paid',
           payment_date = current_date,
           paid_by = v_uid
     where nursery_id = p_nursery_id
       and pay_period_start = p_month
       and pay_period_end = v_end
       and payment_status = 'pending'
    returning id, staff_id, nursery_id, pay_period_start, total_amount
  loop
    v_paid_count := v_paid_count + 1;
    select sp.user_id
      into v_staff_user_id
      from public.staff_profiles sp
     where sp.id = v_payroll.staff_id;
    if v_staff_user_id is not null then
      perform public.notify_users(
        array[v_staff_user_id],
        v_payroll.nursery_id,
        'staff_payroll_paid',
        'staff_payroll_paid',
        jsonb_build_object(
          'month', to_char(v_payroll.pay_period_start, 'YYYY-MM'),
          'amount', v_payroll.total_amount,
          'currency', 'EGP'
        ),
        '/staff/payslips'
      );
    end if;
  end loop;

  v_result := jsonb_build_object('status', 'paid', 'paid_count', v_paid_count);
  perform public.staff_payroll_finish_operation(p_idempotency_key, v_result);
  return v_result;
end;
$$;

drop policy if exists staff_payroll_admin_all on public.staff_payroll;
drop policy if exists staff_payroll_perm_insert on public.staff_payroll;
drop policy if exists staff_payroll_perm_update on public.staff_payroll;
revoke insert, update, delete on public.staff_payroll from public, anon, authenticated;

revoke all on function public.staff_payroll_begin_operation(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.staff_payroll_finish_operation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.staff_payroll_require_permission(uuid, text) from public, anon, authenticated;

revoke all on function public.create_staff_payroll(uuid, uuid, date, date, numeric, numeric, numeric, text, text, uuid) from public, anon;
revoke all on function public.generate_monthly_staff_payroll(uuid, date, uuid) from public, anon;
revoke all on function public.mark_staff_payroll_paid(uuid, date, uuid) from public, anon;
revoke all on function public.mark_month_staff_payroll_paid(uuid, date, uuid) from public, anon;

grant execute on function public.create_staff_payroll(uuid, uuid, date, date, numeric, numeric, numeric, text, text, uuid) to authenticated;
grant execute on function public.generate_monthly_staff_payroll(uuid, date, uuid) to authenticated;
grant execute on function public.mark_staff_payroll_paid(uuid, date, uuid) to authenticated;
grant execute on function public.mark_month_staff_payroll_paid(uuid, date, uuid) to authenticated;

commit;
