-- Demo seed · 99 · Finish
--
-- Drops the seed's helpers (they are not part of the app) and refreshes the planner's statistics for
-- the tables that just grew, so the app's queries plan well from the first request.

drop schema if exists seed cascade;

analyze public.children;
analyze public.users;
analyze public.parent_children;
analyze public.attendance_records;
analyze public.daily_reports;
analyze public.invoices;
analyze public.payment_attempts;
analyze public.permissions;
analyze public.inventory_movements;
analyze public.kitchen_charges;
analyze public.menu_dishes;
