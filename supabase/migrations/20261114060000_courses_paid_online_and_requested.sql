-- Courses: the family pays their bills online, and asks to enrol a child.
--
-- 1. A course bill was paid only at the office (the admin marked it paid). Now each new course bill
--    is also a family invoice (invoice_type 'course', billed to the child's main parent and so seen
--    and paid by both parents of a child in both parents' custody), so it is paid like any invoice:
--    online, by a transfer with its proof, or at the office. The two stay in step: the invoice paid
--    (or cancelled) marks the course bill paid (or waived); the admin marking the course bill paid
--    records the payment on the invoice (admin_record_invoice_payment); waiving it cancels the
--    invoice. The family's notice of a new course bill opens the invoice.
-- 2. A family saw only the courses its children were in. Now it reads the nursery's open courses
--    (course_catalog_for_family: what, when, the price, the places left, and each child's state)
--    and asks to enrol a child (course_request_enrollment; cancelled with course_request_cancel).
--    The nursery's admins hear of each request and approve or decline it (course_request_decide);
--    approving enrols the child; the family hears the answer.

-- -----------------------------------------------------------------------------------------------
-- 1. Course bills as invoices
alter table public.invoices drop constraint if exists invoices_invoice_type_check;
alter table public.invoices
  add constraint invoices_invoice_type_check check (invoice_type in ('monthly', 'event', 'extra_hours', 'other', 'food_extras', 'course'));

alter table public.course_invoices add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create unique index if not exists uq_course_invoices_invoice on public.course_invoices (invoice_id) where invoice_id is not null;

-- The parent a child's bills go to: the main parent, else the first linked.
create or replace function public.child_billed_parent(p_child_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pc.parent_id from public.parent_children pc
   where pc.child_id = p_child_id
   order by pc.is_primary desc nulls last, pc.created_at, pc.parent_id
   limit 1;
$$;

-- Makes a course bill's invoice (once, while it is to pay); returns it.
create or replace function public.course_invoice_to_invoice(p_course_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.course_invoices;
  v_course public.courses;
  v_parent uuid;
  v_month text;
  v_invoice uuid;
begin
  select * into v_bill from public.course_invoices where id = p_course_invoice_id for update;
  if not found or v_bill.invoice_id is not null or v_bill.status not in ('pending', 'overdue') then
    return v_bill.invoice_id;
  end if;
  v_parent := public.child_billed_parent(v_bill.child_id);
  if v_parent is null then
    return null;
  end if;
  select * into v_course from public.courses where id = v_bill.course_id;
  v_month := to_char(v_bill.billing_month, 'MM/YYYY');
  insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
  values (
    v_bill.nursery_id, v_parent, v_bill.amount,
    coalesce(v_bill.due_date, (v_bill.billing_month + interval '1 month 4 days')::date),
    'pending', 'course',
    jsonb_build_object(
      'child_id', v_bill.child_id, 'course_id', v_bill.course_id, 'course_invoice_id', v_bill.id,
      'billing_month', to_char(v_bill.billing_month, 'YYYY-MM'),
      'items', jsonb_build_array(jsonb_build_object(
        'kind', 'course', 'quantity', 1, 'unit_price', v_bill.amount, 'unitPrice', v_bill.amount, 'total', v_bill.amount,
        'name_ar', coalesce(nullif(v_course.title_ar, ''), v_course.title_en) || ' · ' || v_month,
        'name_en', coalesce(nullif(v_course.title_en, ''), v_course.title_ar) || ' · ' || v_month
      ))
    )
  )
  returning id into v_invoice;
  update public.course_invoices set invoice_id = v_invoice where id = v_bill.id;
  return v_invoice;
end;
$$;

create or replace function public.course_invoice_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.course_invoice_to_invoice(new.id);
  return new;
end;
$$;

-- (runs before trg_course_invoice_tell_family: triggers fire by name)
drop trigger if exists trg_course_invoice_bill on public.course_invoices;
create trigger trg_course_invoice_bill
  after insert on public.course_invoices
  for each row execute function public.course_invoice_bill();

-- The family's notice of a new course bill opens its invoice.
create or replace function public.course_invoice_tell_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children;
  v_course public.courses;
  v_invoice uuid := (select ci.invoice_id from public.course_invoices ci where ci.id = new.id);
begin
  if new.status not in ('pending', 'overdue') then
    return new;
  end if;
  select * into v_child from public.children where id = new.child_id;
  select * into v_course from public.courses where id = new.course_id;
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = new.child_id),
    new.nursery_id, 'course_invoice_new', 'course_invoice_new',
    jsonb_build_object(
      'child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en),
      'course', jsonb_build_object('ar', v_course.title_ar, 'en', v_course.title_en),
      'month', to_char(new.billing_month, 'YYYY-MM'),
      'amount', new.amount,
      'currency', coalesce(new.currency, 'EGP'),
      'due_date', new.due_date
    ),
    case when v_invoice is not null then '/parent/invoices/' || v_invoice::text else '/parent/courses?tab=invoices' end
  );
  return new;
end;
$$;

-- The invoice paid or cancelled: the course bill follows.
create or replace function public.invoice_sync_course_bill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_type <> 'course' or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'paid' then
    update public.course_invoices set status = 'paid', paid_at = coalesce(new.paid_at, now())
     where invoice_id = new.id and status <> 'paid';
  elsif new.status = 'cancelled' then
    update public.course_invoices set status = 'waived'
     where invoice_id = new.id and status in ('pending', 'overdue');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_sync_course_bill on public.invoices;
create trigger trg_invoice_sync_course_bill
  after update of status on public.invoices
  for each row execute function public.invoice_sync_course_bill();

-- The course bill marked paid or waived by the admin: the invoice follows (the payment recorded
-- as at the office, under the admin's own payment rights).
create or replace function public.course_bill_sync_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_left numeric;
begin
  if new.invoice_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  select * into v_invoice from public.invoices where id = new.invoice_id;
  if not found then
    return new;
  end if;
  if new.status = 'paid' and v_invoice.status not in ('paid', 'cancelled') then
    v_left := v_invoice.amount - public.invoice_paid_total(v_invoice.id);
    if v_left > 0 then
      perform public.admin_record_invoice_payment(v_invoice.id, v_left, 'cash', coalesce(new.paid_at, now()), null);
    else
      update public.invoices set status = 'paid', paid_at = coalesce(paid_at, now()) where id = v_invoice.id;
    end if;
  elsif new.status = 'waived' and v_invoice.status in ('pending', 'overdue') then
    update public.invoices set status = 'cancelled' where id = v_invoice.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_course_bill_sync_invoice on public.course_invoices;
create trigger trg_course_bill_sync_invoice
  after update of status on public.course_invoices
  for each row execute function public.course_bill_sync_invoice();

-- The bills already waiting get their invoice.
select public.course_invoice_to_invoice(ci.id) from public.course_invoices ci
 where ci.invoice_id is null and ci.status in ('pending', 'overdue');

-- -----------------------------------------------------------------------------------------------
-- 2. Asking to enrol
create table if not exists public.course_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  parent_id uuid not null references public.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_course_request_pending on public.course_enrollment_requests (course_id, child_id) where status = 'pending';
create index if not exists idx_course_requests_nursery on public.course_enrollment_requests (nursery_id, status);
create index if not exists idx_course_requests_child on public.course_enrollment_requests (child_id);
create index if not exists idx_course_requests_parent on public.course_enrollment_requests (parent_id);
create index if not exists idx_course_requests_course on public.course_enrollment_requests (course_id);
create index if not exists idx_course_requests_decided_by on public.course_enrollment_requests (decided_by);

drop trigger if exists trg_course_requests_updated_at on public.course_enrollment_requests;
create trigger trg_course_requests_updated_at before update on public.course_enrollment_requests
  for each row execute function public.set_updated_at();

alter table public.course_enrollment_requests enable row level security;
drop policy if exists course_requests_read on public.course_enrollment_requests;
create policy course_requests_read on public.course_enrollment_requests
  for select to authenticated
  using (
    public.is_nursery_staff(nursery_id, false)
    or (public.current_user_role() = 'parent'::public.user_role and public.parent_can_access_child(child_id))
  );
revoke insert, update, delete, truncate on public.course_enrollment_requests from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not (select puballtables from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'course_enrollment_requests') then
    alter publication supabase_realtime add table public.course_enrollment_requests;
  end if;
end;
$$;

-- A course still open on the nursery's day: active, not ended.
create or replace function public.course_is_open(p_course public.courses)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_course.status = 'active' and (p_course.ends_on is null or p_course.ends_on >= public.nursery_today(p_course.nursery_id));
$$;

create or replace function public.course_active_count(p_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.course_enrollments e where e.course_id = p_course_id and e.status = 'active';
$$;

-- The open courses of the nurseries of the signed-in parent's children, each with its places left
-- and, for each of the parent's children there, whether they are in it, asked, or neither.
create or replace function public.course_catalog_for_family()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'parent'::public.user_role then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', co.id, 'nursery_id', co.nursery_id,
             'title_ar', co.title_ar, 'title_en', co.title_en,
             'description_ar', co.description_ar, 'description_en', co.description_en,
             'category', co.category, 'price_per_month', co.price_per_month,
             'schedule_days', co.schedule_days, 'schedule_time_start', co.schedule_time_start, 'schedule_time_end', co.schedule_time_end,
             'starts_on', co.starts_on, 'ends_on', co.ends_on,
             'max_students', co.max_students, 'enrolled', public.course_active_count(co.id),
             'teacher', (select jsonb_build_object('ar', u.name_ar, 'en', u.name_en) from public.users u where u.id = co.teacher_user_id),
             'children', (
               select jsonb_agg(jsonb_build_object(
                        'child_id', c.id,
                        'state', case
                                   when exists (select 1 from public.course_enrollments e where e.course_id = co.id and e.child_id = c.id and e.status = 'active') then 'enrolled'
                                   when r.id is not null then 'pending'
                                   else 'none'
                                 end,
                        'request_id', r.id) order by c.full_name_en)
                 from public.parent_children pc
                 join public.children c on c.id = pc.child_id and c.nursery_id = co.nursery_id
                 left join public.course_enrollment_requests r on r.course_id = co.id and r.child_id = c.id and r.status = 'pending'
                where pc.parent_id = auth.uid()
             )
           ) order by co.title_en)
      from public.courses co
     where co.nursery_id in (select c.nursery_id from public.parent_children pc join public.children c on c.id = pc.child_id where pc.parent_id = auth.uid())
       and public.course_is_open(co)
  ), '[]'::jsonb);
end;
$$;

-- A parent asks to enrol their child; the nursery's admins and managers hear of it.
create or replace function public.course_request_enrollment(p_course_id uuid, p_child_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses;
  v_child public.children;
  v_id uuid;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'parent'::public.user_role
     or not public.parent_can_access_child(p_child_id) then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  select * into v_course from public.courses where id = p_course_id;
  select * into v_child from public.children where id = p_child_id;
  if v_course.id is null or v_child.id is null or v_course.nursery_id <> v_child.nursery_id or not public.course_is_open(v_course) then
    raise exception 'course_not_open' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.course_enrollments e where e.course_id = p_course_id and e.child_id = p_child_id and e.status = 'active') then
    raise exception 'course_already_enrolled' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.course_enrollment_requests r where r.course_id = p_course_id and r.child_id = p_child_id and r.status = 'pending') then
    raise exception 'course_already_requested' using errcode = 'P0001';
  end if;
  if v_course.max_students is not null and public.course_active_count(p_course_id) >= v_course.max_students then
    raise exception 'course_full' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'course_note_too_long' using errcode = 'P0001';
  end if;

  insert into public.course_enrollment_requests (nursery_id, course_id, child_id, parent_id, note)
  values (v_course.nursery_id, p_course_id, p_child_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  perform public.attendance_notify_staff(
    v_course.nursery_id, array['branch_admin', 'manager']::public.user_role[], 'course_request_new', 'course_request_new',
    jsonb_build_object('child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en),
                       'course', jsonb_build_object('ar', v_course.title_ar, 'en', v_course.title_en)),
    '/admin/courses/' || p_course_id::text || '?tab=requests', 'normal'
  );
  return v_id;
end;
$$;

-- The family withdraws a request still waiting.
create or replace function public.course_request_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.course_enrollment_requests;
begin
  select * into v_request from public.course_enrollment_requests where id = p_request_id for update;
  if not found or public.current_user_role() is distinct from 'parent'::public.user_role or not public.parent_can_access_child(v_request.child_id) then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'course_request_closed' using errcode = 'P0001';
  end if;
  update public.course_enrollment_requests set status = 'cancelled', decided_at = now() where id = p_request_id;
end;
$$;

-- The nursery answers a request: approving enrols the child (again, if they had left); the family
-- hears the answer.
create or replace function public.course_request_decide(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.course_enrollment_requests;
  v_course public.courses;
  v_child public.children;
begin
  select * into v_request from public.course_enrollment_requests where id = p_request_id for update;
  if not found or not public.is_nursery_staff(v_request.nursery_id, false) then
    raise exception 'course_forbidden' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'course_request_closed' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'course_note_too_long' using errcode = 'P0001';
  end if;
  select * into v_course from public.courses where id = v_request.course_id;
  select * into v_child from public.children where id = v_request.child_id;

  if p_approve then
    if v_course.max_students is not null and public.course_active_count(v_course.id) >= v_course.max_students then
      raise exception 'course_full' using errcode = 'P0001';
    end if;
    insert into public.course_enrollments (course_id, child_id, enrolled_by_user_id, status, enrolled_at)
    values (v_course.id, v_child.id, auth.uid(), 'active', now())
    on conflict (course_id, child_id) do update
      set status = 'active', enrolled_at = now(), unenrolled_at = null, enrolled_by_user_id = auth.uid();
  end if;

  update public.course_enrollment_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request_id;

  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = v_child.id),
    v_request.nursery_id,
    case when p_approve then 'course_request_approved' else 'course_request_declined' end,
    case when p_approve then 'course_request_approved' else 'course_request_declined' end,
    jsonb_build_object('child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en),
                       'course', jsonb_build_object('ar', v_course.title_ar, 'en', v_course.title_en),
                       'note', coalesce(nullif(btrim(coalesce(p_note, '')), ''), '')),
    '/parent/courses', 'normal'
  );
end;
$$;

-- -----------------------------------------------------------------------------------------------
revoke all on function public.child_billed_parent(uuid) from public, anon;
revoke all on function public.course_invoice_to_invoice(uuid) from public, anon, authenticated;
revoke all on function public.course_invoice_bill() from public, anon, authenticated;
revoke all on function public.invoice_sync_course_bill() from public, anon, authenticated;
revoke all on function public.course_bill_sync_invoice() from public, anon, authenticated;
revoke all on function public.course_is_open(public.courses) from public, anon;
revoke all on function public.course_active_count(uuid) from public, anon;
revoke all on function public.course_catalog_for_family() from public, anon;
revoke all on function public.course_request_enrollment(uuid, uuid, text) from public, anon;
revoke all on function public.course_request_cancel(uuid) from public, anon;
revoke all on function public.course_request_decide(uuid, boolean, text) from public, anon;
grant execute on function public.child_billed_parent(uuid) to authenticated, service_role;
grant execute on function public.course_is_open(public.courses) to authenticated, service_role;
grant execute on function public.course_active_count(uuid) to authenticated, service_role;
grant execute on function public.course_catalog_for_family() to authenticated, service_role;
grant execute on function public.course_request_enrollment(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.course_request_cancel(uuid) to authenticated, service_role;
grant execute on function public.course_request_decide(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.course_invoice_to_invoice(uuid) to service_role;
