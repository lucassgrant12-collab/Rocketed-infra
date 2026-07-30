# Atlus Pay coordinator

A Node/Express server the browser extension talks to when a payment is confirmed. Talks to the **real** [Bitrefill API](https://docs.bitrefill.com), not a mock, moves real money once configured.

## What was actually verified before this was built

An earlier version of this integration was specced against endpoints that don't exist: a `api-sandbox.bitrefill.com` host (doesn't resolve), a `POST /v1/invoices` path, and a response containing card details directly. Before writing any code, that spec was checked against Bitrefill's real, published documentation (`docs.bitrefill.com`). What's actually real:

- **No sandbox host and no testnet payment method.** Bitrefill uses one API, with hidden "test products" instead of a separate environment, and those only work with `payment_method: "balance"`, meaning even test products require a funded account balance from a real crypto deposit. There is no free way to end-to-end test this integration.
- **No Visa/card test product exists.** The only test SKUs are generic gift-card-link/code and phone-refill simulations.
- **Direct per-order crypto payment does exist**, which matters for staying non-custodial: you don't have to pre-fund an account balance to sell a specific product. `POST /v2/invoices` with a `products` array and a `payment_method` like `"ethereum"` returns a payment address and amount for that one order, payable directly by the end customer's own wallet.
- **The real base URL is `https://api-bitrefill.com`**, invoice creation is `/v2/invoices`, invoice status is `/v2/invoices/:id`, order fulfillment detail is `/orders/:id`, and product search is `/products/search?q=...`.
- **Card credentials are not returned as structured fields.** A fulfilled order's `redemption_info` field is free text (Bitrefill's own doc example: `"To redeem this gift card go to example.com and copy paste your PIN code"`). Whether a Digital Prepaid Visa order's `redemption_info` actually contains a parseable card number/expiry/CVV, and in what exact format, has not been confirmed against a real fulfilled order. See "Unverified" below.

## Run it

```
cd coordinator
npm install
cp .env.example .env   # then fill in the values below
npm start
```

Listens on `http://localhost:3001` by default (set `PORT` in `.env` to change it).

## Required setup

1. **`BITREFILL_API_KEY`**: a personal API bearer token from your Bitrefill account settings (docs.bitrefill.com/docs/api-overview).
2. **`BITREFILL_VISA_PRODUCT_ID`**: there's no fixed, guessable product ID for the Digital Prepaid Visa card. Look it up yourself once the server is running:
   ```
   curl "http://localhost:3001/api/bitrefill/search-products?q=prepaid%20visa"
   ```
   and copy the `id` of the correct US Digital Prepaid Visa result into `.env`.
3. **`MAX_SPEND_USD`**: a hard cap (default $20) the coordinator enforces on any single invoice, before the request ever reaches Bitrefill. Keep this low while testing.

## Endpoints

**Bitrefill passthrough**, exposed for convenience, not called by the extension:

| Endpoint | Purpose |
|---|---|
| `GET /api/bitrefill/search-products?q=...` | Find a product's real `id`. Used once, manually, to fill in `BITREFILL_VISA_PRODUCT_ID`. |

**Atlus's own endpoints**, the only ones the extension calls:

| Endpoint | Purpose |
|---|---|
| `POST /api/atlus/create-payment` | Body: `{ amountFiat }`. Creates a real Bitrefill invoice for `BITREFILL_VISA_PRODUCT_ID`, rejected if `amountFiat` exceeds `MAX_SPEND_USD`. Returns `{ invoiceId, paymentAddress, amountCrypto, cryptoCurrency, status }`. |
| `POST /api/atlus/poll-until-paid` | Body: `{ invoiceId }`. Polls the real invoice every 2 seconds for up to 2 minutes. Once paid, fetches the order and attempts to parse card details from `redemption_info`. Returns `{ status: "paid", card: { number, expiry, cvv } }`, `{ status: "expired" | "cancelled" | "timeout" }`, or a 502 with the raw `redemptionInfo` text if parsing fails. |

## Unverified: the `redemption_info` card parser

`parseCardFromRedemptionInfo()` in `server.js` is a best-effort regex over free text, written against Bitrefill's generic documentation example, not a real Digital Prepaid Visa order's actual response. The first real test payment will either confirm it works or return a 502 with the raw `redemptionInfo` string, which is exactly what's needed to fix the patterns to match the real format. This is the single biggest unverified assumption in the whole integration, everything else here was checked directly against Bitrefill's documentation.

## Card details

Never logged, and never handled by anything except this coordinator and the browser extension in memory during a single payment. There's no mock fallback: if `BITREFILL_API_KEY` or `BITREFILL_VISA_PRODUCT_ID` are unset, `/api/atlus/create-payment` fails clearly instead of returning fake data.
