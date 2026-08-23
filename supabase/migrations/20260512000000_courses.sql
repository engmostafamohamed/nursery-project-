-- Courses: monthly recurring courses with per-child invoicing

create table if not exists courses (
  id                   uuid primary key default gen_random_uuid(),
  nursery_id           uuid not null references nurseries(id) on delete cascade,
  title_ar             text not null default '',
  title_en             text not null default '',
  description_ar       text,
  description_en       text,
  category             text not null default 'academic'
                         check (category in ('sport','art','music','academic','language','other')),
  price_per_month      numeric(10,2) not null default 0,
  max_students         integer,
  schedule_days        text[],
  schedule_time_start  text,
  schedule_time_end    text,
  starts_on            date,
  ends_on              date,
  status               text not null default 'active'
                         check (status in ('active','paused','completed','cancelled')),
  teacher_user_id      uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists course_enrollments (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references courses(id) on delete cascade,
  child_id             uuid not null references children(id) on delete cascade,
  enrolled_by_user_id  uuid references users(id) on delete set null,
  status               text not null default 'active'
                         check (status in ('active','paused','cancelled')),
  enrolled_at          timestamptz not null default now(),
  unenrolled_at        timestamptz,
  created_at           timestamptz not null default now(),
  unique (course_id, child_id)
);

create table if not exists course_invoices (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references courses(id) on delete cascade,
  enrollment_id    uuid not null references course_enrollments(id) on delete cascade,
  child_id         uuid not null references children(id) on delete cascade,
  nursery_id       uuid not null references nurseries(id) on delete cascade,
  billing_month    date not null,
  amount           numeric(10,2) not null,
  currency         text not null default 'EGP',
  status           text not null default 'pending'
                     check (status in ('pending','paid','overdue','waived')),
  due_date         date,
  paid_at          timestamptz,
  invoice_number   text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (enrollment_id, billing_month)
);

-- Indexes for common lookups
create index if not exists courses_nursery_id_idx          on courses (nursery_id);
create index if not exists courses_teacher_user_id_idx     on courses (teacher_user_id);
create index if not exists course_enrollments_course_id_idx on course_enrollments (course_id);
create index if not exists course_enrollments_child_id_idx  on course_enrollments (child_id);
create index if not exists course_invoices_course_id_idx    on course_invoices (course_id);
create index if not exists course_invoices_child_id_idx     on course_invoices (child_id);
create index if not exists course_invoices_nursery_id_idx   on course_invoices (nursery_id);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger courses_updated_at
  before update on courses
  for each row execute function update_updated_at_column();

create trigger course_invoices_updated_at
  before update on course_invoices
  for each row execute function update_updated_at_column();

-- RLS: admins manage everything; teachers read their own courses; parents read their children's data
alter table courses          enable row level security;
alter table course_enrollments enable row level security;
alter table course_invoices  enable row level security;

-- Courses policies
create policy "nursery admins manage courses"
  on courses for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.nursery_id = courses.nursery_id
        and u.role in ('branch_admin','chain_super_admin')
    )
  );

create policy "teachers read own courses"
  on courses for select
  using (teacher_user_id = auth.uid());

create policy "parents read courses their children are enrolled in"
  on courses for select
  using (
    exists (
      select 1 from course_enrollments ce
        join parent_children pc on pc.child_id = ce.child_id
      where ce.course_id = courses.id
        and pc.parent_id = auth.uid()
        and ce.status = 'active'
    )
  );

-- Enrollments policies
create policy "nursery admins manage enrollments"
  on course_enrollments for all
  using (
    exists (
      select 1 from courses c
        join users u on u.nursery_id = c.nursery_id
      where c.id = course_enrollments.course_id
        and u.id = auth.uid()
        and u.role in ('branch_admin','chain_super_admin')
    )
  );

create policy "teachers read enrollments for own courses"
  on course_enrollments for select
  using (
    exists (
      select 1 from courses c
      where c.id = course_enrollments.course_id
        and c.teacher_user_id = auth.uid()
    )
  );

create policy "parents read their children enrollments"
  on course_enrollments for select
  using (
    exists (
      select 1 from parent_children pc
      where pc.child_id = course_enrollments.child_id
        and pc.parent_id = auth.uid()
    )
  );

-- Invoices policies
create policy "nursery admins manage invoices"
  on course_invoices for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.nursery_id = course_invoices.nursery_id
        and u.role in ('branch_admin','chain_super_admin')
    )
  );

create policy "parents read their children invoices"
  on course_invoices for select
  using (
    exists (
      select 1 from parent_children pc
      where pc.child_id = course_invoices.child_id
        and pc.parent_id = auth.uid()
    )
  );
