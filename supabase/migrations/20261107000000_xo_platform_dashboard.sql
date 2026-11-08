-- The XO platform home page: the numbers and charts of the whole platform in one call, for the
-- platform's super admin only (replaces 17 separate counts read from the browser).
--
-- Days and months are Cairo days. Money follows the nursery's finance page: "collected" is completed
-- payments by the day they were paid; what an open invoice still owes is its amount less its
-- completed payments; cancelled invoices count nowhere. Deleted nurseries and their children,
-- invoices and payments are left out.
--
-- Attendance: on each day a nursery recorded at least one check-in (it was open), the children
-- checked in out of its active children enrolled by that day. Days with no check-in at all are left
-- out, so weekends and holidays do not read as zero.

create or replace function public.get_xo_platform_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_last_month date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_first_month date := (date_trunc('month', v_today) - interval '11 months')::date;
  v_from30 date := v_today - 29;
begin
  if not public.is_xo_super_admin() then
    raise exception 'xo_dashboard_forbidden' using errcode = '42501';
  end if;

  return (
    with live as (
      select n.id, n.name_ar, n.name_en, nullif(btrim(n.city), '') as city, n.subscription_status,
             n.subscription_plan, n.suspended_at, (n.created_at at time zone 'Africa/Cairo')::date as created_day,
             n.created_at
        from public.nurseries n
       where n.deleted_at is null
    ),
    kids as (
      select c.id, c.nursery_id, c.status, c.dob, c.enrollment_date, c.gender
        from public.children c
        join live l on l.id = c.nursery_id
    ),
    paid_by_invoice as (
      select p.invoice_id, sum(p.amount) as paid
        from public.payments p
       where p.status = 'completed'
       group by p.invoice_id
    ),
    inv as (
      select i.nursery_id, i.status, i.amount, i.due_date,
             greatest(0, i.amount - coalesce(pb.paid, 0)) as remaining
        from public.invoices i
        join live l on l.id = i.nursery_id
        left join paid_by_invoice pb on pb.invoice_id = i.id
       where i.status <> 'cancelled'
    ),
    pay as (
      select i.nursery_id, p.amount, coalesce(nullif(btrim(p.method), ''), 'other') as method,
             (p.paid_at at time zone 'Africa/Cairo')::date as day
        from public.payments p
        join public.invoices i on i.id = p.invoice_id
        join live l on l.id = i.nursery_id
       where p.status = 'completed'
         and p.paid_at is not null
    ),
    att as (
      select k.nursery_id, a.attendance_date as day, count(distinct a.child_id) as present
        from public.attendance_records a
        join kids k on k.id = a.child_id
       where a.attendance_date between v_from30 and v_today
         and a.check_in is not null
         and k.status = 'active'
         and (k.enrollment_date is null or k.enrollment_date <= a.attendance_date)
       group by k.nursery_id, a.attendance_date
    ),
    -- Each open day's expected children: the nursery's active children enrolled by that day.
    att_day as (
      select att.nursery_id, att.day, att.present, count(k.id) as expected
        from att
        join kids k
          on k.nursery_id = att.nursery_id
         and k.status = 'active'
         and (k.enrollment_date is null or k.enrollment_date <= att.day)
       group by att.nursery_id, att.day, att.present
    ),
    months as (
      select g::date as m
        from generate_series(v_first_month, v_month, interval '1 month') as g
    ),
    billed_by_month as (
      select date_trunc('month', due_date)::date as m, sum(amount) as billed
        from inv where due_date >= v_first_month group by 1
    ),
    collected_by_month as (
      select date_trunc('month', day)::date as m, sum(amount) as collected
        from pay where day >= v_first_month group by 1
    ),
    enrolled_by_month as (
      select date_trunc('month', enrollment_date)::date as m, count(*) as n
        from kids where enrollment_date >= v_first_month group by 1
    ),
    per_nursery_kids as (
      select nursery_id, count(*) filter (where status = 'active') as active_children from kids group by 1
    ),
    per_nursery_att as (
      select nursery_id, sum(present) as present_30, sum(expected) as expected_30 from att_day group by 1
    ),
    per_nursery_inv as (
      select nursery_id,
             sum(remaining) filter (where status in ('pending', 'overdue')) as outstanding,
             count(*) filter (where status = 'overdue') as overdue_count
        from inv group by 1
    ),
    per_nursery_pay as (
      select nursery_id, sum(amount) filter (where day >= v_month) as collected_this_month from pay group by 1
    ),
    staff as (
      select u.nursery_id, count(*) filter (where u.role = 'teacher') as teachers
        from public.users u
        join live l on l.id = u.nursery_id
       group by u.nursery_id
    )
    select jsonb_build_object(
      'today', v_today,

      'nurseries', jsonb_build_object(
        'total', (select count(*) from live),
        'active', (select count(*) from live where subscription_status in ('active', 'trial')),
        'trial', (select count(*) from live where subscription_status = 'trial'),
        'suspended', (select count(*) from live where suspended_at is not null or subscription_status = 'suspended'),
        'new_this_month', (select count(*) from live where created_day >= v_month),
        'by_status', (
          select coalesce(jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc, s.k nulls last), '[]'::jsonb)
            from (select subscription_status as k, count(*) as n from live group by 1) s
        ),
        'by_plan', (
          select coalesce(jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc, s.k nulls last), '[]'::jsonb)
            from (select subscription_plan as k, count(*) as n from live group by 1) s
        ),
        'by_city', (
          select coalesce(jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc, s.k nulls last), '[]'::jsonb)
            from (select city as k, count(*) as n from live group by 1) s
        )
      ),

      'children', jsonb_build_object(
        'active', (select count(*) from kids where status = 'active'),
        'pending', (select count(*) from kids where status = 'pending'),
        'new_this_month', (select count(*) from kids where enrollment_date >= v_month and enrollment_date <= v_today),
        'new_last_month', (select count(*) from kids where enrollment_date >= v_last_month and enrollment_date < v_month),
        'girls', (select count(*) from kids where status = 'active' and gender = 'female'),
        'boys', (select count(*) from kids where status = 'active' and gender = 'male'),
        -- Whole years of age, 5 meaning 5 and over.
        'by_age', (
          select coalesce(jsonb_agg(jsonb_build_object('years', s.y, 'count', s.n) order by s.y), '[]'::jsonb)
            from (
              select greatest(0, least(5, extract(year from age(v_today, dob))::int)) as y, count(*) as n
                from kids
               where status = 'active' and dob is not null
               group by 1
            ) s
        ),
        'monthly_enrollments', (
          select jsonb_agg(jsonb_build_object('month', to_char(m.m, 'YYYY-MM'), 'count', coalesce(e.n, 0)) order by m.m)
            from months m
            left join enrolled_by_month e on e.m = m.m
        )
      ),

      'users', jsonb_build_object(
        'total', (select count(*) from public.users),
        'new_this_month', (select count(*) from public.users where (created_at at time zone 'Africa/Cairo')::date >= v_month),
        'by_role', (
          select coalesce(jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n) order by s.n desc, s.k), '[]'::jsonb)
            from (select role::text as k, count(*) as n from public.users group by 1) s
        )
      ),

      'finance', jsonb_build_object(
        'collected_this_month', (select coalesce(sum(amount), 0) from pay where day >= v_month),
        'collected_last_month', (select coalesce(sum(amount), 0) from pay where day >= v_last_month and day < v_month),
        'outstanding', (select coalesce(sum(remaining), 0) from inv where status in ('pending', 'overdue')),
        -- Open invoices count what is still owed, as on the nursery's finance page.
        'by_status', (
          select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n, 'amount', s.amount) order by s.status), '[]'::jsonb)
            from (
              select status, count(*) as n,
                     sum(case when status in ('pending', 'overdue') then remaining else amount end) as amount
                from inv
               group by status
            ) s
        ),
        -- Overdue invoices still owing, by days past their due date: 1 = up to 30, 2 = 31-60, 3 = 61-90, 4 = over 90.
        'aging', (
          select coalesce(jsonb_agg(jsonb_build_object('band', s.b, 'count', s.n, 'amount', s.amount) order by s.b), '[]'::jsonb)
            from (
              select case
                       when v_today - due_date <= 30 then 1
                       when v_today - due_date <= 60 then 2
                       when v_today - due_date <= 90 then 3
                       else 4
                     end as b,
                     count(*) as n, sum(remaining) as amount
                from inv
               where status = 'overdue' and remaining > 0
               group by 1
            ) s
        ),
        -- Billed: invoices by the month they fall due. Collected: payments by the month they were paid.
        'monthly', (
          select jsonb_agg(jsonb_build_object(
                   'month', to_char(m.m, 'YYYY-MM'),
                   'billed', coalesce(b.billed, 0),
                   'collected', coalesce(c.collected, 0)
                 ) order by m.m)
            from months m
            left join billed_by_month b on b.m = m.m
            left join collected_by_month c on c.m = m.m
        ),
        'by_method', (
          select coalesce(jsonb_agg(jsonb_build_object('key', s.k, 'count', s.n, 'amount', s.amount) order by s.amount desc, s.k), '[]'::jsonb)
            from (select method as k, count(*) as n, sum(amount) as amount from pay where day >= v_first_month group by 1) s
        )
      ),

      'attendance', jsonb_build_object(
        'present', (select coalesce(sum(present), 0) from att_day),
        'expected', (select coalesce(sum(expected), 0) from att_day),
        'daily', (
          select jsonb_agg(jsonb_build_object(
                   'date', d.day::date,
                   'present', coalesce(s.present, 0),
                   'expected', coalesce(s.expected, 0)
                 ) order by d.day)
            from generate_series(v_from30, v_today, interval '1 day') as d(day)
            left join (select day, sum(present) as present, sum(expected) as expected from att_day group by day) s
              on s.day = d.day::date
        )
      ),

      -- The last 12 months.
      'admissions', jsonb_build_object(
        'inquiries', (
          select count(*) from public.inquiries q join live l on l.id = q.nursery_id
           where (q.created_at at time zone 'Africa/Cairo')::date >= v_first_month
        ),
        'applications', (
          select count(*) from public.applications a join live l on l.id = a.nursery_id
           where a.status <> 'draft' and (a.created_at at time zone 'Africa/Cairo')::date >= v_first_month
        ),
        'approved', (
          select count(*) from public.applications a join live l on l.id = a.nursery_id
           where a.status = 'approved' and (a.created_at at time zone 'Africa/Cairo')::date >= v_first_month
        ),
        'inquiries_new', (
          select count(*) from public.inquiries q join live l on l.id = q.nursery_id where q.status = 'new'
        ),
        'applications_pending', (
          select count(*) from public.applications a join live l on l.id = a.nursery_id
           where a.status in ('submitted', 'under_review', 'documents_pending')
        )
      ),

      'by_nursery', (
        select coalesce(jsonb_agg(to_jsonb(s) order by s.active_children desc, s.name_en), '[]'::jsonb)
          from (
            select l.id, l.name_ar, l.name_en, l.city, l.subscription_status, l.subscription_plan, l.created_at,
                   coalesce(k.active_children, 0) as active_children,
                   coalesce(st.teachers, 0) as teachers,
                   coalesce(a.present_30, 0) as present_30,
                   coalesce(a.expected_30, 0) as expected_30,
                   coalesce(p.collected_this_month, 0) as collected_this_month,
                   coalesce(i.outstanding, 0) as outstanding,
                   coalesce(i.overdue_count, 0) as overdue_count
              from live l
              left join per_nursery_kids k on k.nursery_id = l.id
              left join staff st on st.nursery_id = l.id
              left join per_nursery_att a on a.nursery_id = l.id
              left join per_nursery_inv i on i.nursery_id = l.id
              left join per_nursery_pay p on p.nursery_id = l.id
          ) s
      )
    )
  );
end;
$$;

revoke execute on function public.get_xo_platform_dashboard() from public, anon;
grant execute on function public.get_xo_platform_dashboard() to authenticated, service_role;
