// coordinator/server.js
//
// Talks to the REAL Bitrefill API (docs.bitrefill.com), not a mock.
// Verified directly against Bitrefill's own documentation before writing
// this, since an earlier spec for this integration turned out to describe
// endpoints that don't actually exist (no "sandbox" host, no "/v1/invoices"
// path, no per-invoice card object). The endpoints, field names, and flow
// below are the real ones:
//
//   POST /v2/invoices           - create an invoice for a specific product,
//                                  payable directly with crypto (no need to
//                                  pre-fund an account balance for this).
//   GET  /v2/invoices/:id       - check invoice/payment status.
//   GET  /orders/:id            - once an invoice's order is fulfilled,
//                                  fetch the redemption details.
//   GET  /products/search?q=... - find a product's real product_id.
//
// This moves real money. Two safety measures on top of Bitrefill's own
// behavior:
//   - MAX_SPEND_USD caps what any single invoice can be created for.
//   - The Visa card product_id is never guessed or auto-discovered at
//     request time. It's a required env var you set once, after looking
//     it up yourself (see README), so a bad search match can never
//     silently buy the wrong product.

const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const BITREFILL_BASE_URL = "https://api-bitrefill.com";
const BITREFILL_API_KEY = process.env.BITREFILL_API_KEY;
const BITREFILL_VISA_PRODUCT_ID = process.env.BITREFILL_VISA_PRODUCT_ID;
const MAX_SPEND_USD = Number(process.env.MAX_SPEND_USD || 20);

if (!BITREFILL_API_KEY) {
  console.warn(
    "BITREFILL_API_KEY is not set. /api/atlus/create-payment will fail until it's added to coordinator/.env."
  );
}
if (!BITREFILL_VISA_PRODUCT_ID) {
  console.warn(
    "BITREFILL_VISA_PRODUCT_ID is not set. Look up the real product_id (see README) and add it to coordinator/.env before creating a real invoice."
  );
}

async function bitrefillRequest(path, options = {}) {
  const response = await fetch(`${BITREFILL_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${BITREFILL_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body?.message || `Bitrefill request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

// ---------------------------------------------------------------------
// Convenience: look up a product_id by search term. Not used by the
// payment flow itself, exposed here so you can find the real Visa card
// product_id without leaving the coordinator (see README step 2).
// ---------------------------------------------------------------------
app.get("/api/bitrefill/search-products", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "q query param is required" });

  try {
    const result = await bitrefillRequest(`/products/search?q=${encodeURIComponent(q)}`);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Atlus's own endpoints. The extension only ever calls these two.
// ---------------------------------------------------------------------

app.post("/api/atlus/create-payment", async (req, res) => {
  const { amountFiat } = req.body ?? {};

  if (!amountFiat || Number(amountFiat) <= 0) {
    return res.status(400).json({ error: "amountFiat is required and must be positive" });
  }
  if (Number(amountFiat) > MAX_SPEND_USD) {
    return res.status(400).json({
      error: `amountFiat exceeds the configured spend cap ($${MAX_SPEND_USD}). Raise MAX_SPEND_USD in .env if this is intentional.`,
    });
  }
  if (!BITREFILL_API_KEY || !BITREFILL_VISA_PRODUCT_ID) {
    return res.status(500).json({
      error: "Coordinator is missing BITREFILL_API_KEY or BITREFILL_VISA_PRODUCT_ID. See README.",
    });
  }

  try {
    const invoice = await bitrefillRequest("/v2/invoices", {
      method: "POST",
      body: JSON.stringify({
        products: [{ product_id: BITREFILL_VISA_PRODUCT_ID, quantity: 1, value: Number(amountFiat) }],
        payment_method: "ethereum",
      }),
    });

    const data = invoice.data;
    res.json({
      invoiceId: data.id,
      paymentAddress: data.payment.address,
      amountCrypto: data.payment.price,
      cryptoCurrency: data.payment.currency,
      status: data.status,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/atlus/poll-until-paid", async (req, res) => {
  const { invoiceId } = req.body ?? {};
  if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });

  const POLL_INTERVAL_MS = 2000;
  const TIMEOUT_MS = 120000;
  const deadline = Date.now() + TIMEOUT_MS;

  try {
    while (Date.now() < deadline) {
      const invoice = await bitrefillRequest(`/v2/invoices/${invoiceId}`);
      const data = invoice.data;

      if (data.status === "paid" || data.status === "complete") {
        const orderId = data.orders?.[0]?.id;
        if (!orderId) {
          return res.status(502).json({ error: "Invoice paid but no order was created" });
        }

        const order = await bitrefillRequest(`/orders/${orderId}`);
        const card = parseCardFromRedemptionInfo(order.data.redemption_info);

        if (!card) {
          // The exact format of redemption_info for a Digital Prepaid Visa
          // order hasn't been confirmed against a real fulfilled order yet
          // (see README's "unverified" note). Returning the raw text lets
          // whoever's testing this see exactly what came back and fix the
          // parser to match, instead of failing silently.
          return res.status(502).json({
            error: "Could not parse card details from redemption_info",
            redemptionInfo: order.data.redemption_info,
          });
        }

        return res.json({ status: "paid", card });
      }

      if (data.status === "expired" || data.status === "cancelled") {
        return res.json({ status: data.status });
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    res.json({ status: "timeout" });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Best-effort parser for redemption_info, which Bitrefill's own docs show
// as free text ("To redeem this gift card go to example.com and copy paste
// your PIN code"), not structured card fields. This has not been verified
// against a real Digital Prepaid Visa order's actual redemption_info
// content, only against the generic example in Bitrefill's docs. Update
// these patterns once a real order's format is known.
function parseCardFromRedemptionInfo(text) {
  if (!text) return null;

  const numberMatch = text.match(/\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/);
  const expiryMatch = text.match(/\b(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})\b/);
  const cvvMatch = text.match(/\bCVV\D{0,5}(\d{3,4})\b/i);

  if (!numberMatch || !expiryMatch || !cvvMatch) return null;

  return {
    number: numberMatch[1].replace(/[\s-]/g, ""),
    expiry: `${expiryMatch[1]}/${expiryMatch[2].slice(-2)}`,
    cvv: cvvMatch[1],
  };
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Atlus Pay coordinator (real Bitrefill) listening on http://localhost:${PORT}`);
  console.log(`Spend cap: $${MAX_SPEND_USD} per invoice.`);
});
