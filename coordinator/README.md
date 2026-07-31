# Atlus Pay coordinator

A Node/Express server the Atlus desktop app (and the earlier browser extension) talks to when a payment is confirmed. Talks to the **real** [Bitrefill API](https://docs.bitrefill.com), not a mock, moves real money once configured.

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
2. **`MAX_SPEND_USD`**: a hard cap (default $20) the coordinator enforces on any single invoice's card value, before the request ever reaches Bitrefill. Interpreted in whatever currency the matched retailer's product actually uses (mostly USD, some AUD/GBP/CAD, see `retailers.js`). Keep this low while testing.

There's no product ID to configure by hand anymore, see below.

## The retailer catalog (`retailers.js`)

The card-issuing model changed from a single configured Visa card to a **merchant-specific gift card matched by domain**. `retailers.js` is a hand-curated list of `{ name, domain, productId, category, type }`, each entry checked against the real `GET /v2/products/:id` endpoint before being added, the same discipline the old single `BITREFILL_VISA_PRODUCT_ID` env var used to enforce: a product_id is never guessed or fuzzy-matched at request time, only ever looked up once by a person.

`type` is `"range"` (accepts an exact custom amount, no rounding waste) or `"fixed"` (preset denominations only, checkout total rounds up). A wider survey of 77 everyday US/UK/Canada/Australia retailers found **65% support an exact amount**, see [RESEARCH.md](../RESEARCH.md#2026-07-31---the-card-system-changes-again-merchant-gift-cards-not-a-universal-visa) for the full breakdown, including why Australia (42%) lags the US (82%).

Why this replaced the Visa-card plan entirely: neither Visa product tried worked. The AU one (previously configured) turned out to require app-based activation with an Australian mobile number, no plain card number at all, wallet-tokenized only. The real USA one is blocked for this account (`403 not_available`, tied to account country, not IP, confirmed by testing). Full findings in RESEARCH.md.

## Endpoints

**Bitrefill passthrough**, exposed for convenience:

| Endpoint | Purpose |
|---|---|
| `GET /api/bitrefill/search-products?q=...` | Manual product lookup, used once per retailer added to `retailers.js`, never at request time. |

**Atlus's own endpoints**:

| Endpoint | Purpose |
|---|---|
| `GET /api/atlus/retailers` | Returns the full curated catalog. What the desktop app's home screen renders. |
| `GET /api/atlus/match?domain=...` | Exact domain/subdomain match against the catalog. Returns `{ retailer: {...} }` or `{ retailer: null }`. |
| `POST /api/atlus/create-payment` | Body: `{ amountFiat, productId }`. If the product has a `range` covering `amountFiat`, buys that exact amount (`exact: true`). Otherwise picks the cheapest fixed package that covers it (`exact: false`). Rejected if `amountFiat` exceeds `MAX_SPEND_USD` or nothing covers it. Returns `{ invoiceId, paymentAddress, amountCrypto, cryptoCurrency, cardValue, cardCurrency, exact, status }`. |
| `POST /api/atlus/poll-until-paid` | Body: `{ invoiceId }`. Polls every 2 seconds for up to 2 minutes. Once paid, fetches the order and runs `parseRedemption()` over `redemption_info`. Returns `{ status: "paid", redemption: { kind, raw, ... } }` (see below) or `{ status: "expired" | "cancelled" | "timeout" }`. |

## Why USDC, not ETH

`payment.price` for an ETH invoice came back as a raw integer with no sane interpretation under any standard Ethereum unit. USDC's unit (6 decimals) is a fixed token standard, not something to trust Bitrefill's undocumented field on faith for. Full investigation, including the cross-check against Bitcoin that confirmed the "smallest standard unit of that currency" pattern generally holds (just not for ETH), is in [RESEARCH.md](../RESEARCH.md#2026-07-30---payment-currency-switched-from-eth-to-usdc-the-eth-unit-couldnt-be-verified).

## Unverified: the `redemption_info` parser

`parseRedemption()` in `server.js` is a best-effort regex over free text, written against Bitrefill's generic documentation examples, not a real fulfilled order for any specific retailer. It returns one of:

- `{ kind: "creditcard", number, expiry, cvv }` - a Visa-shaped card (kept for if a card-network product's ever added back).
- `{ kind: "code", code }` - a store gift card, Bitrefill's documented convention is a single alphanumeric code, or a number+PIN pair concatenated into one string when a retailer only has one redemption field.
- `{ kind: "unknown" }` - didn't match either shape.

`raw` (the untouched `redemption_info` text) is always included alongside whichever kind matched, specifically so the desktop app can show it as a copy-paste fallback when auto-fill can't confidently place it (there's no HTML `autocomplete` token for gift-card fields the way there is for credit-card fields, so that detection is expected to miss sometimes, not just occasionally fail). This is the single biggest unverified assumption left in the whole integration, everything else here was checked directly against real API responses.

## Card/code details

Never logged, and never handled by anything except this coordinator and the desktop app in memory during a single payment. There's no mock fallback: if `BITREFILL_API_KEY` is unset, `/api/atlus/create-payment` fails clearly instead of returning fake data.
