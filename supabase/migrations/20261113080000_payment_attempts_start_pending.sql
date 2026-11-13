-- Security: a payment a family sends starts "waiting for the nursery".
--
-- A family could insert its payment attempt already "confirmed" (the insert rule did not look at
-- the status): it skipped the balance checks and the nursery's review, and counted as a payment
-- sent for an application. The invoice itself was not marked paid (that comes from payments).
-- Now an attempt made in the app always starts pending_confirmation, with nobody's confirmation on
-- it; confirming stays with the nursery's functions (confirm_payment_attempt_internal, Paymob's
-- settlement), which run as their owner.

create or replace function public.payment_attempts_from_app_start_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := 'pending_confirmation';
    new.confirmed_at := null;
    new.confirmed_by := null;
  end if;
  return new;
end;
$$;

-- Before payment_attempts_before_insert (triggers run by name), so its pending checks apply.
drop trigger if exists payment_attempts_a_start_pending on public.payment_attempts;
create trigger payment_attempts_a_start_pending
  before insert on public.payment_attempts
  for each row execute function public.payment_attempts_from_app_start_pending();

revoke execute on function public.payment_attempts_from_app_start_pending() from public, anon, authenticated;
