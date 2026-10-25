-- One child's daily report for one day, for the teacher's editor: read through a function so the
-- answer is always the latest (the app's service worker answers plain table reads from its cache
-- first, which would reopen a report as it was before the last save). Only those who may write the
-- report read it here: the class's teachers, the nursery's admin, managers with the daily reports
-- permission, chain and XO admins (daily_report_guard). Null when nothing was saved yet.
create or replace function public.get_daily_report(p_child_id uuid, p_report_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.daily_reports%rowtype;
begin
  perform public.daily_report_guard(p_child_id);
  select * into v_row from public.daily_reports where child_id = p_child_id and report_date = p_report_date;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'child_id', v_row.child_id,
    'report_date', v_row.report_date,
    'status', v_row.status,
    'meals_json', v_row.meals_json,
    'nap_json', v_row.nap_json,
    'mood_json', v_row.mood_json,
    'toilet_json', v_row.toilet_json,
    'activities_json', v_row.activities_json,
    'feeding_json', v_row.feeding_json,
    'special_notes', v_row.special_notes,
    'last_saved_at', v_row.last_saved_at,
    'published_at', v_row.published_at
  );
end;
$$;

revoke execute on function public.get_daily_report(uuid, date) from public, anon;
grant execute on function public.get_daily_report(uuid, date) to authenticated, service_role;
