# Paymob card checkout

Parent signup creates the invoice and a pending payment attempt on the server, then
creates a Paymob Intention and redirects the parent to Paymob's hosted checkout.
Card number, expiry, CVV, PIN, and OTP are entered only on Paymob; this application
does not collect or store them.

Configure these Edge Function secrets out of band before enabling `paymob` in the
nursery payment settings:

- `PAYMOB_SECRET_KEY`
- `PAYMOB_PUBLIC_KEY`
- `PAYMOB_CARD_INTEGRATION_ID`
- `PAYMOB_AMOUNT_MULTIPLIER` (`1` when the merchant account expects EGP amounts,
  or `100` when it expects piasters; confirm this with the account's current API
  documentation before enabling checkout)
- `APP_BASE_URL` (the public HTTPS site origin)

Card checkout is not advertised until all required values are present. Never put
Paymob secrets in client code, commit them, or collect card data in this app.

The browser return from Paymob is not treated as proof of payment. Payment attempts
remain pending until nursery finance staff verify the intention in the Paymob
dashboard and confirm or reject it in the admin payment screen. The pending attempt
shows its Paymob intention reference for reconciliation. Automatic payment
finalization requires a verified merchant callback/status-lookup contract and is
not implemented here.
