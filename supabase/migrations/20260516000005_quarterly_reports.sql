-- Quarterly (term) evaluation reports. Admin defines a template (configurable
-- grade scale + sections + skill items), fills a report per child, and sends
-- it to parents. Mirrors the Cherries "Term Evaluation Report" layout.

begin;

create table if not exists public.quarterly_report_templates (
  id         uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  name       text not null default 'Term Evaluation',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quarterly_report_grade_levels (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.quarterly_report_templates(id) on delete cascade,
  nursery_id  uuid not null references public.nurseries(id) on delete cascade,
  code        text not null,
  label_en    text not null default '',
  label_ar    text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (template_id, code)
);

create table if not exists public.quarterly_report_sections (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.quarterly_report_templates(id) on delete cascade,
  nursery_id  uuid not null references public.nurseries(id) on delete cascade,
  title_en    text not null default '',
  title_ar    text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.quarterly_report_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.quarterly_report_sections(id) on delete cascade,
  template_id uuid not null references public.quarterly_report_templates(id) on delete cascade,
  nursery_id  uuid not null references public.nurseries(id) on delete cascade,
  label_en    text not null default '',
  label_ar    text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.quarterly_reports (
  id                  uuid primary key default gen_random_uuid(),
  nursery_id          uuid not null references public.nurseries(id) on delete cascade,
  template_id         uuid not null references public.quarterly_report_templates(id) on delete restrict,
  child_id            uuid not null references public.children(id) on delete cascade,
  term_label          text not null default 'Term 1',
  period_from         date,
  period_to           date,
  attendance_present  integer,
  attendance_total    integer,
  comment             text,
  status              text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at             timestamptz,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (child_id, template_id, term_label)
);

create table if not exists public.quarterly_report_grades (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.quarterly_reports(id) on delete cascade,
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  item_id    uuid not null references public.quarterly_report_items(id) on delete cascade,
  grade_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, item_id)
);

create index if not exists idx_qrt_nursery on public.quarterly_report_templates (nursery_id);
create index if not exists idx_qrgl_template on public.quarterly_report_grade_levels (template_id);
create index if not exists idx_qrs_template on public.quarterly_report_sections (template_id);
create index if not exists idx_qri_section on public.quarterly_report_items (section_id);
create index if not exists idx_qr_child on public.quarterly_reports (child_id);
create index if not exists idx_qrg_report on public.quarterly_report_grades (report_id);

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'quarterly_report_templates','quarterly_report_grade_levels','quarterly_report_sections',
    'quarterly_report_items','quarterly_reports','quarterly_report_grades'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', tbl);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()',
      tbl
    );
    execute format('alter table public.%1$s enable row level security', tbl);
  end loop;
end $$;

-- Visibility helper: staff of the report's nursery, or the child's parent
-- once the report is sent. SECURITY DEFINER to avoid RLS recursion.
create or replace function public.quarterly_report_visible(p_report_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quarterly_reports r
    where r.id = p_report_id
      and (
        public.is_xo_super_admin()
        or (
          public.current_user_role() in ('branch_admin', 'chain_super_admin', 'teacher')
          and r.nursery_id = public.current_user_nursery_id()
        )
        or (r.status = 'sent' and public.parent_has_child(r.child_id))
      )
  );
$$;

-- Template structure tables: admins manage; any authenticated user in the
-- nursery may read (teachers + parents need it to render a report).
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'quarterly_report_templates','quarterly_report_grade_levels',
    'quarterly_report_sections','quarterly_report_items'
  ] loop
    execute format('drop policy if exists %1$s_admin_all on public.%1$s', tbl);
    execute format($f$
      create policy %1$s_admin_all on public.%1$s for all to authenticated
      using (
        public.is_xo_super_admin()
        or (public.current_user_role() in ('branch_admin','chain_super_admin')
            and nursery_id = public.current_user_nursery_id())
      )
      with check (
        public.is_xo_super_admin()
        or (public.current_user_role() in ('branch_admin','chain_super_admin')
            and nursery_id = public.current_user_nursery_id())
      )$f$, tbl);
    execute format('drop policy if exists %1$s_read on public.%1$s', tbl);
    execute format($f$
      create policy %1$s_read on public.%1$s for select to authenticated
      using (public.is_xo_super_admin() or nursery_id = public.current_user_nursery_id())
    $f$, tbl);
  end loop;
end $$;

-- quarterly_reports: admins manage; visibility helper gates reads.
drop policy if exists quarterly_reports_admin_all on public.quarterly_reports;
create policy quarterly_reports_admin_all on public.quarterly_reports for all to authenticated
  using (
    public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin','chain_super_admin')
        and nursery_id = public.current_user_nursery_id())
  )
  with check (
    public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin','chain_super_admin')
        and nursery_id = public.current_user_nursery_id())
  );
drop policy if exists quarterly_reports_read on public.quarterly_reports;
create policy quarterly_reports_read on public.quarterly_reports for select to authenticated
  using (public.quarterly_report_visible(id));

-- quarterly_report_grades: admins manage; reads follow report visibility.
drop policy if exists quarterly_report_grades_admin_all on public.quarterly_report_grades;
create policy quarterly_report_grades_admin_all on public.quarterly_report_grades for all to authenticated
  using (
    public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin','chain_super_admin')
        and nursery_id = public.current_user_nursery_id())
  )
  with check (
    public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin','chain_super_admin')
        and nursery_id = public.current_user_nursery_id())
  );
drop policy if exists quarterly_report_grades_read on public.quarterly_report_grades;
create policy quarterly_report_grades_read on public.quarterly_report_grades for select to authenticated
  using (public.quarterly_report_visible(report_id));

commit;
