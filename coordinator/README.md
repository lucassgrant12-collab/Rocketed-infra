# Atlus Pay coordinator

A Node/Express server the browser extension talks to when a payment is confirmed. Talks to the **real** [Bitrefill API](https://docs.bitrefill.com), not a mock, moves real money once configured.

## What was actually verified before this was built

An earlier version of this integration was specced against endpoints that don't exist: a `api-sandbox.bitrefill.com` host (doesn't resolve), a `POST /v1/invoices` path, and a response containing card details directly. Before writing any code, that spec was checked against Bitrefill's real, published documentation (`docs.bitrefill.com`). What's actually real:

- **No sandbox host and no testnet payment method.** Bitrefill uses one API, with hidden "test products" instead of a separate environment, and those only work with `payment_method: "balance"`, meaning even test products require a funded account balance from a real crypto deposit. There is no free way to end-to-end test this integration.
- **No Visa/card test product exists.** The only test SKUs are generic gift-card-link/code and phone-refill simulations.
- **Direct per-order crypto payment does exist**, which matters for staying non-custodial: you don't have to pre-fund an account balance to sell a specific product. `POST /v2/invoices` with a `products` array and a `payment_method` returns a payment address and amount for that one order, payable directly by the end customer's own wallet.
- **The real base URL is `https://api.bitrefill.com`** (a dot, not the hyphen an earlier version of this file had, a real bug caught while looking up the real product; see the git history if curious). Invoice creation is `/v2/invoices`, invoice status is `/v2/invoices/:id`, order fulfillment detail is `/orders/:id`, product search is `/v2/products/search?q=...`, and a single product's live packages/pricing is `/v2/products/:id`.
- **Card credentials are not returned as structured fields.** A fulfilled order's `redemption_info` field is free text (Bitrefill's own doc example: `"To redeem this gift card go to example.com and copy paste your PIN code"`). Whether a Digital Prepaid Visa order's `redemption_info` actually contains a parseable card number/expiry/CVV, and in what exact format, has not been confirmed against a real fulfilled order. See "Unverified" below.
- **The invoice `payment.price` field's unit is undocumented and, for ETH, unverifiable.** Checked directly with real API calls: BTC and USDC both resolve to sane dollar amounts under their own fixed, universal decimal standards (satoshis, 6-decimal USDC base units), ETH does not resolve under wei or gwei. Payment currency was switched to USDC specifically because its unit could be independently confirmed, not assumed. Full investigation in [RESEARCH.md](../RESEARCH.md#2026-07-30---payment-currency-switched-from-eth-to-usdc-the-eth-unit-couldnt-be-verified).

## Run it

```
cd coordinator
npm install
cp .env.example .env   # then fill in the values below
npm start
```

Listens on `http://localhost:3001` by default (set `PORT` in `.env` to change it).

## Required setup

1. **`BITREFILL_API_KEY`**: Sign in at bitrefill.com, go to Account → Developers, generate an API key. Self-service, no approval process (that's only needed for the separate Business/Partner tier, which isn't what this uses).
2. **`BITREFILL_VISA_PRODUCT_ID`**: there's no fixed, guessable product ID. Look it up once the server is running:
   ```
   curl "http://localhost:3001/api/bitrefill/search-products?q=prepaid%20visa"
   ```
   Note: depending on the account's region, the only Visa product that actually shows up may not be a US one. This project's configured product is `the-visa-digital-gift-card-australia` (AUD), the only Visa card this account's search could find regardless of query or country filter, likely tied to the account's own region. If your account surfaces a different one, use that instead.
3. **`MAX_SPEND_USD`**: a hard cap (default $20) the coordinator enforces on any single invoice's card value, before the request ever reaches Bitrefill. Despite the name, it's interpreted in whatever currency the configured product actually uses (AUD here), not necessarily USD. Keep this low while testing.

## Fixed card denominations

The configured product only comes in fixed packages ($10/$50/$100/$250 AUD), not a freely-set value. `create-payment` fetches the product's live packages (`GET /v2/products/:id`, cached 5 minutes) and picks the cheapest one that still covers the requested amount. Any excess over the actual checkout total is real, non-refunded money, the response includes `cardValue`/`cardCurrency` specifically so the extension can show this to the user *before* they approve a transaction, not bury it in a progress message. A real fix for this (a shared pool of leftover card balances, matched against future orders) is designed but not built, see RESEARCH.md.

## Endpoints

**Bitrefill passthrough**, exposed for convenience, not called by the extension:

| Endpoint | Purpose |
|---|---|
| `GET /api/bitrefill/search-products?q=...` | Find a product's real `id`. Used once, manually, to fill in `BITREFILL_VISA_PRODUCT_ID`. |

**Atlus's own endpoints**, the only ones the extension calls:

| Endpoint | Purpose |
|---|---|
| `POST /api/atlus/create-payment` | Body: `{ amountFiat }`. Picks the cheapest covering package, creates a real Bitrefill invoice paid in USDC on Base, rejected if `amountFiat` exceeds `MAX_SPEND_USD` or no package covers it. Returns `{ invoiceId, paymentAddress, amountCrypto, cryptoCurrency, cardValue, cardCurrency, status }`. |
| `POST /api/atlus/poll-until-paid` | Body: `{ invoiceId }`. Polls the real invoice every 2 seconds for up to 2 minutes. Once paid, fetches the order and attempts to parse card details from `redemption_info`. Returns `{ status: "paid", card: { number, expiry, cvv } }`, `{ status: "expired" | "cancelled" | "timeout" }`, or a 502 with the raw `redemptionInfo` text if parsing fails. |

## Why USDC, not ETH

`payment.price` for an ETH invoice came back as a raw integer with no sane interpretation under any standard Ethereum unit. USDC's unit (6 decimals) is a fixed token standard, not something to trust Bitrefill's undocumented field on faith for. Full investigation, including the cross-check against Bitcoin that confirmed the "smallest standard unit of that currency" pattern generally holds (just not for ETH), is in [RESEARCH.md](../RESEARCH.md#2026-07-30---payment-currency-switched-from-eth-to-usdc-the-eth-unit-couldnt-be-verified).

## Unverified: the `redemption_info` card parser

`parseCardFromRedemptionInfo()` in `server.js` is a best-effort regex over free text, written against Bitrefill's generic documentation example, not a real Digital Prepaid Visa order's actual response. The first real test payment will either confirm it works or return a 502 with the raw `redemptionInfo` string, which is exactly what's needed to fix the patterns to match the real format. This is the single biggest unverified assumption left in the whole integration, everything else here was checked directly against real API responses.

## Card details

Never logged, and never handled by anything except this coordinator and the browser extension in memory during a single payment. There's no mock fallback: if `BITREFILL_API_KEY` or `BITREFILL_VISA_PRODUCT_ID` are unset, `/api/atlus/create-payment` fails clearly instead of returning fake data.
