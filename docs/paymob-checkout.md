# Paymob hosted checkout

Parent signup creates the invoice and a pending payment attempt on the server, then
creates a Paymob Intention with the enabled integrations and redirects the parent
to Paymob's hosted checkout. The parent chooses an enabled option there, such as a
bank card, InstaPay, a supported mobile wallet, or Fawry. Payment credentials and
verification codes are entered only on Paymob; this application does not collect
or store them.

Configure these Edge Function secrets out of band before enabling the matching
payment options in the nursery settings:

- `PAYMOB_SECRET_KEY`
- `PAYMOB_PUBLIC_KEY`
- `PAYMOB_CARD_INTEGRATION_ID` when enabling `paymob`
- `PAYMOB_INSTAPAY_INTEGRATION_ID` when enabling `instapay`
- `PAYMOB_MOBILE_WALLET_INTEGRATION_ID` when enabling `mobile_wallet`
- `PAYMOB_FAWRY_INTEGRATION_ID` when enabling `fawry`
- `PAYMOB_AMOUNT_MULTIPLIER`: `100`. The Intention API takes the amount in piasters
  ("expressed in cents"), and payment results are only applied when Paymob's
  `amount_cents` equals the attempt amount × 100, so any other value means no payment
  ever settles automatically.
- `PAYMOB_HMAC_SECRET` (Paymob dashboard → Settings/Profile → HMAC). **Required**: without
  it online checkout is not offered at all, because no payment result could be verified.
- `APP_BASE_URL` (the public HTTPS site origin)

Only integrations both enabled in nursery settings and configured with an integration
ID are offered to Paymob. Confirm each integration ID and supported payment type with
the nursery's Paymob account. Never put Paymob secrets in client code, commit them,
or collect payment credentials in this app.

## Payment results (webhook and return page)

Migration `20261016000000_paymob_gateway_results.sql` and the `paymob-webhook` Edge Function
settle online payments automatically. A result is applied only when its HMAC (SHA-512 over
Paymob's 20 documented transaction fields) matches `PAYMOB_HMAC_SECRET`:

- **Success for the exact amount** → the attempt is confirmed the same way finance confirms
  one (payment row, invoice status, parent notification, loyalty points).
- **Failure** → the attempt becomes `failed` with a `failure_reason` code; the parent sees
  the reason with "Try again", "Change payment method" and the nursery's phone, and can pay
  again at once.
- **Pending** (e.g. a Fawry reference) → the attempt stays pending and the reference is
  shown to the parent in large type with a copy button.
- **Wrong amount, or money for an attempt finance already rejected or that no longer fits
  the invoice** → nothing is applied automatically; finance gets a
  `payment_gateway_needs_review` notification.

Every verified result is stored in `payment_events` (finance staff can read their nursery's
rows). Results arrive twice for card and wallet payments — the server webhook and the
parent's browser return (verified by `invoice-checkout` `action: 'return'`) — and the second
one is recorded as a duplicate without changing anything.

If the parent leaves Paymob's page without paying, no result ever arrives. The payment step
then offers "I didn't complete the payment", which calls
`cancel_unfinished_online_payment`; it is refused once Paymob reported a transaction or issued
a reference for that attempt. A success that arrives later for a released attempt is still
recorded when the invoice has room for it, otherwise finance is asked to review it.

Setup:

1. Deploy `paymob-webhook` (JWT verification off; `supabase/config.toml` already says so):
   `supabase functions deploy paymob-webhook --no-verify-jwt`.
2. Every Intention names `<SUPABASE_URL>/functions/v1/paymob-webhook` as its
   `notification_url`. Paymob honours that for card integrations only, so also set the same
   URL as the **transaction processed callback** of the wallet, InstaPay and Fawry
   integrations in the Paymob dashboard.
3. Set `PAYMOB_HMAC_SECRET`, then redeploy `invoice-checkout`.

## Paying an existing invoice (parent dashboard)

Invoices that already exist (application packages, tuition, events) are paid from the
application's **Payment** step (after Review and Packages) or the invoice payment page. Both render the shared
`InvoiceCheckoutPanel` (`src/components/payment/`), which offers every method the nursery
enabled: Paymob online checkout first (when configured), then InstaPay, Vodafone Cash,
Etisalat Cash, Fawry (manual) and bank transfer.

Online checkout goes through the `invoice-checkout` Edge Function. It records the payment
request with `submit_invoice_payment` as the signed-in parent (ownership, balance, duplicate
and full-payment rules all apply), creates the Paymob Intention for exactly the amount the
parent confirmed, and returns Paymob's checkout URL. Paymob sends the parent back to the page
they paid from with `?payment=processing`. It uses the same secrets as signup; deploy it with
`supabase functions deploy invoice-checkout`. If it is not deployed, online checkout is simply
not offered and the manual methods keep working.

Every payment is sent once: double clicks are dropped and each retry of the same payment
reuses one idempotency key, so the server returns the first result instead of recording it
again.

### One payment for application invoices

An invoice created for an application (`line_items_json.application_id`) is paid in one
payment of everything still due. The app only offers the full amount, and migration
`20261014000000_application_invoice_full_payment.sql` makes the database refuse a smaller
parent payment with `payment_full_amount_required`. Other invoices still accept partial
payments. Staff-recorded payments are not affected.

### Extra hours on the same payment

The basic extra-hours plan is **pay per hour** at the nursery's rate
(`late_pickup_fee_per_hour`, after the grace period; Admin → Packages → hours tab, or
Settings). Signup and the application's Packages step show it as the first option, selected
by default. Picking a prepaid package moves the selection to that package; removing the
package (or picking the basic plan again) selects pay per hour again. Billing follows the
same rule: `package_apply_extra_hours` covers late time from the package first, and whatever
it does not cover (hours used up, package expired, or removed) is billed per hour. A chosen package goes onto the application invoice
(price minus any live deal) and is paid in the same single payment as the tuition package
(migration `20261015000000_application_invoice_extra_hours.sql`); removing it returns the
parent to the hourly rate only. The choice is locked once a payment is made or submitted.

## Test-only signup simulation

For a development/test Supabase project, set the Edge Function secret
`SIGNUP_PAYMENT_TEST_MODE=true`. This makes signup display a clearly marked test
bank-card form, validates the entered fake card details only in browser memory, skips
every Paymob request, and creates a pending payment attempt marked `[TEST PAYMENT]`.
Card details are not sent to the server or saved. Test attempts cannot be confirmed
as real payments. Turn this flag off before any real-provider testing or production
use. Do not enable it on a production project.

For a hosted development project, set this under **Supabase Dashboard → Project
Settings → Edge Functions → Secrets** (or with the Supabase CLI linked to that
development project). For local Supabase, provide the variable to
`supabase functions serve` through a local-only environment file. Do not commit
that file or set this secret on the production project.

## Manual Fawry and Etisalat Cash in signup

Apply migration `20261011030000_manual_fawry_etisalat_wallet.sql` and deploy the
updated `parent-signup-complete` Edge Function. In admin Financial settings, enable
**Fawry (manual verification)** and/or **Etisalat Cash**. Configure the Etisalat Cash
receiving number before enabling that option.

Fawry signup collects a reference already issued by Fawry or provided by the nursery;
it does not generate a Fawry reference or verify payment automatically. Etisalat Cash
signup collects the wallet phone, customer name, and payment screenshot for manual
finance review. The screenshot is stored in the private `payment-proofs` bucket.
These manual options work without Paymob integration secrets.

Cash on delivery is an admin-only method; it is not offered to parents in signup or
the parent payment page.

Unsigned browser parameters are never treated as proof of payment. Online attempts are
settled only from HMAC-verified Paymob results (see "Payment results" above); anything
that cannot be applied automatically is left for finance, who still see the Paymob
intention reference on the pending attempt for reconciliation.
