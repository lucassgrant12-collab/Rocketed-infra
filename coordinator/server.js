// coordinator/server.js
//
// Talks to the REAL Bitrefill API (docs.bitrefill.com), not a mock.
// Verified directly against Bitrefill's own documentation before writing
// this, since an earlier spec for this integration turned out to describe
// endpoints that don't actually exist (no "sandbox" host, no "/v1/invoices"
// path, no per-invoice card object). The endpoints, field names, and flow
// below are the real ones:
//
//   POST /v2/invoices              - create an invoice for a specific
//                                     product, payable directly with
//                                     crypto (no need to pre-fund an
//                                     account balance for this).
//   GET  /v2/invoices/:id          - check invoice/payment status.
//   GET  /orders/:id               - once an invoice's order is
//                                     fulfilled, fetch redemption details.
//   GET  /v2/products/search?q=... - find a product's real product_id.
//   GET  /v2/products/:id          - a single product's live packages
//                                     (denominations) and pricing.
//
// This moves real money. Safety measures on top of Bitrefill's own
// behavior:
//   - MAX_SPEND_USD caps what any single invoice can be created for.
//   - A retailer's product_id is never guessed or fuzzy-matched at
//     request time. Every entry in retailers.js was looked up and checked
//     against the live API by a person once, so a bad search match can
//     never silently buy the wrong product. See retailers.js.
//
// The card-issuing model changed after the first version of this file:
// it used to always buy a single configured Visa gift card, rounding the
// checkout total up to the nearest fixed denomination. That Visa card
// turned out to be unusable for Atlus's purposes (see RESEARCH.md's
// 2026-07-31 entries): the AU product requires app-based activation with
// an Australian phone number, no plain card number at all, and the real
// USA product is blocked for this account. The replacement model buys a
// merchant-specific gift card for whatever retailer the user is actually
// on, using an exact custom amount wherever the product supports one
// (most do, see retailers.js and RESEARCH.md's survey), only falling
// back to rounding up when a product is fixed-denomination only.

const express = require("express");
require("dotenv").config();
const { RETAILERS, findByDomain } = require("./retailers");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const BITREFILL_BASE_URL = "https://api.bitrefill.com";
const BITREFILL_API_KEY = process.env.BITREFILL_API_KEY;
const MAX_SPEND_USD = Number(process.env.MAX_SPEND_USD || 20);

if (!BITREFILL_API_KEY) {
  console.warn(
    "BITREFILL_API_KEY is not set. /api/atlus/create-payment will fail until it's added to coordinator/.env."
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
    const result = await bitrefillRequest(`/v2/products/search?q=${encodeURIComponent(q)}`);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

// Products are fetched live rather than hardcoded (prices, stock, and
// ranges can change), but now keyed per product_id instead of a single
// global Visa product, since a payment can be for any retailer in
// retailers.js. Cached for a few minutes so repeated calls for the same
// product don't re-fetch every time.
const productCache = new Map(); // product_id -> { data, at }
const PRODUCT_CACHE_MS = 5 * 60 * 1000;

async function getProduct(productId) {
  const cached = productCache.get(productId);
  if (cached && Date.now() - cached.at < PRODUCT_CACHE_MS) {
    return cached.data;
  }
  const result = await bitrefillRequest(`/v2/products/${productId}`);
  productCache.set(productId, { data: result.data, at: Date.now() });
  return result.data;
}

// Picks the cheapest package that still covers the requested amount.
// Whatever's left over on the card above the actual checkout total is
// real money the buyer doesn't get back, this is a genuine limitation of
// fixed-denomination cards, not something to hide from the caller.
function selectPackage(packages, amountFiat) {
  const sorted = [...packages].sort((a, b) => Number(a.value) - Number(b.value));
  return sorted.find((pkg) => Number(pkg.value) >= amountFiat) ?? null;
}

// ---------------------------------------------------------------------
// Retailer catalog: what the desktop app's home screen lists, and how a
// checkout page gets matched to a real product_id.
// ---------------------------------------------------------------------

app.get("/api/atlus/retailers", (req, res) => {
  res.json({ retailers: RETAILERS });
});

app.get("/api/atlus/match", (req, res) => {
  const domain = req.query.domain;
  if (!domain) return res.status(400).json({ error: "domain query param is required" });
  res.json({ retailer: findByDomain(domain) });
});

// ---------------------------------------------------------------------
// Atlus's own payment endpoints.
// ---------------------------------------------------------------------

app.post("/api/atlus/create-payment", async (req, res) => {
  const { amountFiat, productId } = req.body ?? {};

  if (!amountFiat || Number(amountFiat) <= 0) {
    return res.status(400).json({ error: "amountFiat is required and must be positive" });
  }
  if (!productId) {
    return res.status(400).json({ error: "productId is required (see /api/atlus/retailers)" });
  }
  if (Number(amountFiat) > MAX_SPEND_USD) {
    return res.status(400).json({
      error: `amountFiat exceeds the configured spend cap (${MAX_SPEND_USD}). Raise MAX_SPEND_USD in .env if this is intentional.`,
    });
  }
  if (!BITREFILL_API_KEY) {
    return res.status(500).json({ error: "Coordinator is missing BITREFILL_API_KEY. See README." });
  }

  try {
    const product = await getProduct(productId);
    const requested = Number(amountFiat);

    // Ranged products take an exact value, no rounding, no waste. Only
    // fall back to picking a fixed package when the product has no range
    // at all, or the requested amount falls outside it.
    const inRange = product.range && requested >= Number(product.range.min) && requested <= Number(product.range.max);

    let productLine;
    let cardValue;
    let exact;

    if (inRange) {
      productLine = { product_id: productId, quantity: 1, value: requested.toFixed(2) };
      cardValue = requested;
      exact = true;
    } else {
      const selectedPackage = product.packages?.length ? selectPackage(product.packages, requested) : null;
      if (!selectedPackage) {
        const ceiling = product.range?.max ?? Math.max(...(product.packages || []).map((pkg) => Number(pkg.value)));
        return res.status(400).json({
          error: `No card covers ${amountFiat} ${product.currency}. Largest available is ${ceiling} ${product.currency}.`,
        });
      }
      productLine = { product_id: productId, quantity: 1, package_id: selectedPackage.id };
      cardValue = selectedPackage.value;
      exact = false;
    }

    const invoice = await bitrefillRequest("/v2/invoices", {
      method: "POST",
      body: JSON.stringify({
        products: [productLine],
        // usdc_base, not "ethereum": ETH's invoice price came back as an
        // unverifiable raw integer with no documented unit, USDC's is a
        // confirmed, fixed 6-decimal standard. See RESEARCH.md.
        payment_method: "usdc_base",
      }),
    });

    const data = invoice.data;
    res.json({
      invoiceId: data.id,
      paymentAddress: data.payment.address,
      amountCrypto: data.payment.price,
      cryptoCurrency: data.payment.currency,
      cardValue,
      cardCurrency: product.currency,
      exact,
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
        const redemption = parseRedemption(order.data.redemption_info);

        return res.json({ status: "paid", redemption });
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

// Best-effort parser for redemption_info, which Bitrefill's own docs
// describe as free text that varies per retailer, not a fixed structured
// format: a Visa-style card gives a 16-digit number/expiry/CVV, while a
// store gift card (Starbucks, Target, etc, the common case for the
// retailer catalog in retailers.js) is usually a single alphanumeric code
// or a number+PIN pair meant to be concatenated into one string, per
// Bitrefill's own help docs. None of this has been confirmed against a
// real fulfilled order for any specific retailer yet (see RESEARCH.md).
// `raw` is always returned alongside whatever got parsed, specifically so
// the overlay can show it as a copy-paste fallback when a checkout page
// has no field this can confidently auto-fill, since there's no
// autocomplete-token equivalent for gift-card fields the way there is for
// credit-card fields, unreliable detection is expected here, not an edge
// case.
function parseRedemption(text) {
  if (!text) return { kind: "unknown", raw: "" };

  const numberMatch = text.match(/\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/);
  const expiryMatch = text.match(/\b(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})\b/);
  const cvvMatch = text.match(/\bCVV\D{0,5}(\d{3,4})\b/i);

  if (numberMatch && expiryMatch && cvvMatch) {
    return {
      kind: "creditcard",
      raw: text,
      number: numberMatch[1].replace(/[\s-]/g, ""),
      expiry: `${expiryMatch[1]}/${expiryMatch[2].slice(-2)}`,
      cvv: cvvMatch[1],
    };
  }

  const codeMatch = text.match(/\b([A-Z0-9]{6,20})\b/i);
  const pinMatch = text.match(/\bPIN\D{0,6}(\d{3,8})\b/i);
  const code = codeMatch ? codeMatch[1] + (pinMatch ? pinMatch[1] : "") : null;

  return { kind: code ? "code" : "unknown", raw: text, code };
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Atlus Pay coordinator (real Bitrefill) listening on http://localhost:${PORT}`);
  console.log(`Spend cap: $${MAX_SPEND_USD} per invoice.`);
});
