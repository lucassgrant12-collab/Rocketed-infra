# Atlus Pay coordinator (mock)

A Node/Express server the browser extension talks to when a payment is confirmed. Currently mocks [Bitrefill's](https://www.bitrefill.com) prepaid card API, since there's no live Bitrefill account yet, but is shaped to match their real API closely enough that swapping in a real account later is a small, contained change.

## Run it

```
cd coordinator
npm install
npm start
```

Listens on `http://localhost:3001` by default (set `PORT` to change it). The extension's [background.js](../extension/background.js) already points at that URL.

## Endpoints

**Mock Bitrefill API**, shaped after `https://api.bitrefill.com/v1/...`:

| Endpoint | Purpose |
|---|---|
| `POST /api/bitrefill/invoice` | Create an invoice. Body: `{ productId, amount, currency, cryptoCurrency }`. Returns a payment address and the crypto amount owed. |
| `GET /api/bitrefill/invoice/:id` | Check status. Returns `cardDetails` once `status` is `"paid"`. |
| `POST /api/bitrefill/simulate-payment` | Not a real Bitrefill endpoint. Marks an invoice paid instantly, standing in for "the wallet's crypto payment settled" until real payment detection exists. |

**Atlus's own endpoints**, the ones the extension actually calls:

| Endpoint | Purpose |
|---|---|
| `POST /api/atlus/create-payment` | Body: `{ amountFiat, currency }`. Opens an invoice, returns `{ invoiceId, paymentAddress, amountCrypto }`. |
| `POST /api/atlus/complete-payment` | Body: `{ invoiceId }`. Marks the invoice paid and returns `{ cardNumber, expiry, cvv }`. |

The extension only ever calls the `/api/atlus/...` pair. That's deliberate: it means the card provider underneath can change without touching a single line of extension code, only what these two handlers do internally.

## Replacing the mock with real Bitrefill

1. Get a Bitrefill API key (requires a real Bitrefill business account).
2. In `/api/bitrefill/invoice` and `GET /api/bitrefill/invoice/:id`, replace the in-memory `Map` logic with an actual proxied call to `https://api.bitrefill.com/v1/invoices`, forwarding the API key. Response shape stays the same, so nothing downstream needs to change.
3. Delete `/api/bitrefill/simulate-payment`. It only exists because there's no real crypto payment to wait for yet.
4. In `/api/atlus/complete-payment`, replace the direct `invoice.status = "paid"` with an actual poll of `GET /api/bitrefill/invoice/:id` (with a timeout and retry interval) until the real payment settles, instead of assuming it already has.
5. `/api/atlus/create-payment` stays as is. It was already just wrapping the invoice creation call.

The extension never needs to change for any of this, since it only ever talks to `/api/atlus/create-payment` and `/api/atlus/complete-payment`, and both keep the same request/response shape throughout.

## Card details

`generateMockCard()` always returns Stripe's well-known `4242 4242 4242 4242` test number. That's intentional: obviously fake, immediately recognizable as test data to anyone who's worked with payments, never mistakable for a real card.
