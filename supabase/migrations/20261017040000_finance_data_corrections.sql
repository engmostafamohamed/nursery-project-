-- One-off corrections to production data, decided by the nursery owner on 2026-10-17. Every step
-- names the exact rows, so on any other database this migration changes nothing.
--
-- 1. INV-2026-09-0001 (250 EGP): one manual payment was recorded 9 times within 4 seconds on
--    2026-09-01 (repeated clicks, before payments had idempotency keys) and loyalty points were
--    awarded for each. Keep the first payment; mark the other 8 failed so they stay visible but no
--    longer count as money received, and remove the 8 duplicate loyalty awards (2,000 points; the
--    balance is the sum of loyalty_transactions).
-- 2. 42 monthly invoices created 2026-06-09 (157,500 EGP) were marked paid without any payment row,
--    so revenue reports missed them. Record one completed manual payment per invoice for its full
--    amount, dated its due date. No loyalty points are awarded for these.
-- 3. A custom discount created inline and never attached to a package or used on an invoice.
--
-- Not changed on purpose: the 15 late-pickup days of 2026-04-28..2026-07-08 (1,970 EGP) recorded
-- before late fees were invoiced stay as history, not billed.

begin;

-- 1. Duplicate payment ----------------------------------------------------------------------------

update public.payments
   set status = 'failed',
       updated_at = now()
 where status = 'completed'
   and invoice_id = '20d146e6-a7b8-42b8-8bf8-1e046dd1bf31'
   and id in (
     '22954197-410b-443d-b5fc-ac6d9f717ab3', '5be65a4a-6086-4a85-a087-f5ed292b1a09',
     '2960cc8f-922b-4d30-b301-8b1bd473b265', '76c05089-4c6d-419c-8d58-6781cc626790',
     'e6134e07-60ea-4066-8574-7bf328b8eaba', '03f4bada-38b0-4530-b60c-49b3ec1a6e15',
     '24a38ab6-e5eb-4468-a4d6-2c15472d7691', '5554cc9b-53fe-407a-832c-07d934295be9'
   );

delete from public.loyalty_transactions
 where reference_id = '20d146e6-a7b8-42b8-8bf8-1e046dd1bf31'
   and source = 'payment'
   and id in (
     '998774aa-d913-4ceb-9e98-fbbade2a1ec5', '8f4a41d1-b4d3-461b-b983-4e020605bd6d',
     '476197ce-0a7e-46fb-a406-0cf12f55d2b5', '9e99110b-29b9-4732-9231-9ecdfd1c824e',
     '15d20e16-2406-4dd2-ab43-441d0ad4ff82', '3168fe22-94d5-4ab1-a8d4-b13ed215ac4b',
     '7d84d075-84f9-4abb-9f15-84f8f16dcc54', 'd826d56a-9763-4693-b026-c7746be1d524'
   );

-- 2. Paid invoices without a payment record --------------------------------------------------------

insert into public.payments (invoice_id, amount, method, status, paid_at)
select i.id,
       i.amount,
       'manual',
       'completed',
       (i.due_date + time '12:00') at time zone 'Africa/Cairo'
  from public.invoices i
 where i.status = 'paid'
   and not exists (select 1 from public.payments p where p.invoice_id = i.id and p.status = 'completed')
   and i.id in (
     '0f1fa139-f0fd-4e38-87cd-be8465681960', '257fed2f-f85a-4218-b1fe-3cdbcb24a653', '07c6c379-5c3d-4560-98a7-9d36e9708520',
     'b4e8fadd-75d5-4b10-b24a-ec91205425c9', 'd4ce968d-3b1d-4721-b4e0-d1baa5902400', '52688236-cf74-4bb0-8fac-1010bead73c2',
     '958bb2a9-d268-4f52-8fe6-91d05ff87b92', 'ec501013-0967-4c4b-ad28-fa264479922c', '29d3408f-92a9-4e86-a36d-ede58f6b69a5',
     '8f68f0fb-05b1-4888-b06e-5bc93d15ba5a', '2a5e5660-abcd-4192-96d3-0737c2e3041f', '2cc971c8-d3c4-42e1-8d04-a4c5f5036062',
     'f27f7607-d314-4ecd-be81-4528ba467909', '9d68be29-53b0-4470-90f6-4f8edfed62d3', '67cf60d8-0872-4380-8f47-4e5eb0e8ba04',
     'c7a5b31d-72a1-4707-a0e9-38c2c19ead3d', 'ad965e86-0b34-4c1a-b0f7-f95404c6449a', '9d1a8360-ce95-4930-87d0-8b5f0ed0fa80',
     '2dac4d5e-f0c5-440a-a8da-54ae5f722db6', '5e947870-4fd8-472a-a76a-2444a80fb23a', '229e96c0-0d78-410e-a08c-e3f0719b3cb9',
     '1a9e6ba9-dad0-41f7-8d54-6647e2c3b103', '86b906ed-eaa4-4cf3-b7a3-50f26faff172', '14a3d62d-9749-4451-ab09-b6496aefe831',
     'e4ce1413-6afb-4f0f-bf72-40bce5010251', '5ef731ad-10bb-4423-b375-d59109d7d103', '0012bb01-54b5-4efe-9806-5f8bd8801960',
     '0657dc82-99f6-400a-849c-f47a00054c7a', 'f272e417-89af-468b-8a9e-75eac6a02741', '3e44801c-ec0d-4634-b5b4-74dc1fafed03',
     '52f6396d-49f6-4729-8291-8605667b42d1', '4cefa24f-a894-4529-b1ca-cc1926220a61', '10c0061b-de8f-4277-9ad9-6ab0ad719738',
     '816c7e30-fb90-4624-9a0b-bdd43d7b5612', '69242aea-7e4d-4fa2-81d6-f67ff72ee008', 'f23858b1-c7ae-44fb-9d12-f9063c47c1cf',
     'bc8cff4b-b431-48cd-a1c9-e826be12930f', 'eb498fbb-d1ff-4260-aeff-6895f8c277a4', '8de3da6b-bb34-4f88-b0dc-e76c90ef76cd',
     'eb45b839-674f-4e5c-b678-3720918117d9', '12a5c07c-7462-40d1-badb-cf464623e346', 'bf3f8c50-b8f2-4b98-85a8-7eac41ac3af2'
   );

-- 3. Unused custom discount ----------------------------------------------------------------------

delete from public.deals d
 where d.id = '8394abe3-a5ca-46f9-bee7-813a6e39737f'
   and not exists (select 1 from public.tuition_packages t where t.deal_id = d.id)
   and not exists (select 1 from public.packages p where p.deal_id = d.id);

commit;
