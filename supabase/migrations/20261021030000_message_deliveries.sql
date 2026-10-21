-- Every email, SMS and WhatsApp message the app sends, one row each: which kind of message, to
-- whom, who asked for it, and whether it really went out (live) or was only recorded (demo, while
-- the provider's keys are not set). The text and any code inside it are never stored.
--
-- Written only by the email-dispatch, sms-dispatch and whatsapp-dispatch functions (service role).
-- The nursery's admins and managers read their nursery's rows; XO admins read all; a chain admin
-- reads the chain's nurseries. Also used to cap how many messages a parent can send themselves.

create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid references public.nurseries(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  message_type text not null check (char_length(message_type) between 1 and 64),
  recipient text not null check (char_length(recipient) between 1 and 320),
  user_id uuid references public.users(id) on delete set null,
  requested_by uuid references public.users(id) on delete set null,
  mode text not null check (mode in ('demo', 'live')),
  status text not null check (status in ('sent', 'failed')),
  provider text not null,
  provider_message_id text,
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists message_deliveries_nursery_created_idx on public.message_deliveries (nursery_id, created_at desc);
create index if not exists message_deliveries_requester_idx on public.message_deliveries (requested_by, channel, created_at desc);

alter table public.message_deliveries enable row level security;

drop policy if exists message_deliveries_staff_select on public.message_deliveries;
create policy message_deliveries_staff_select on public.message_deliveries
  for select to authenticated
  using (
    public.is_xo_super_admin()
    or exists (
      select 1
      from public.users u
      left join public.nurseries n on n.id = message_deliveries.nursery_id
      where u.id = auth.uid()
        and (
          (u.role in ('branch_admin', 'manager') and u.nursery_id = message_deliveries.nursery_id)
          or (u.role = 'chain_super_admin' and n.chain_id is not null and n.chain_id = u.chain_id)
        )
    )
  );

-- No insert, update or delete for signed-in users: the functions write with the service role.
revoke all on table public.message_deliveries from anon;
revoke insert, update, delete on table public.message_deliveries from authenticated;
grant select on table public.message_deliveries to authenticated;
