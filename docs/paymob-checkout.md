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
- `PAYMOB_AMOUNT_MULTIPLIER` (`1` when the merchant account expects EGP amounts,
  or `100` when it expects piasters; confirm this with the account's current API
  documentation before enabling checkout)
- `APP_BASE_URL` (the public HTTPS site origin)

Only integrations both enabled in nursery settings and configured with an integration
ID are offered to Paymob. Confirm each integration ID and supported payment type with
the nursery's Paymob account. Never put Paymob secrets in client code, commit them,
or collect payment credentials in this app.

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

The browser return from Paymob is not treated as proof of payment. Payment attempts
remain pending until nursery finance staff verify the intention in the Paymob
dashboard and confirm or reject it in the admin payment screen. The pending attempt
shows its Paymob intention reference for reconciliation. Automatic payment
finalization requires a verified merchant callback/status-lookup contract and is
not implemented here.
