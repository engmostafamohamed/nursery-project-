-- Demo seed · 02 · Reset what is left
--
-- After the branches: any child or parent outside them (in the nurseries made while testing:
-- ghnghn, rtyrty, test, ttest), those nurseries, the chain an earlier run made, and the main
-- branch's test features with the placeholder names they were given while testing (events, tuition
-- packages, discounts, a class, packages and a course).

select seed.pause_app_guards(true);

delete from public.children;
select seed.remove_users(seed.replaced_users(null));
select seed.remove_nurseries(array(
  select n.id from public.nurseries n
  where n.id <> seed.config('main_branch_id')::uuid and n.name_en in ('ghnghn', 'rtyrty', 'test', 'ttest')
));
delete from public.chains where id = seed.uid('chain');

delete from public.events where nursery_id = seed.config('main_branch_id')::uuid;
delete from public.tuition_packages where nursery_id = seed.config('main_branch_id')::uuid;
delete from public.packages
 where nursery_id = seed.config('main_branch_id')::uuid
   and (name_en in ('vvfdv', '1 Hr Late') or name_ar is null or btrim(name_ar) = '');
delete from public.deals where nursery_id = seed.config('main_branch_id')::uuid and name_en = 'Custom discount';
delete from public.courses where nursery_id = seed.config('main_branch_id')::uuid and title_en = 'janas course';
delete from public.classes where nursery_id = seed.config('main_branch_id')::uuid and name_en = 'fghfgh';

select seed.pause_app_guards(false);
