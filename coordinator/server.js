// coordinator/server.js
//
// Mock coordinator for Atlus Pay. Exposes two groups of endpoints:
//
//   1. A mock of Bitrefill's real API shape (/api/bitrefill/...), matching
//      https://api.bitrefill.com/v1/... closely enough that swapping in a
//      real Bitrefill account later means changing what these handlers do
//      internally (proxy to the real API instead of an in-memory Map), not
//      changing the shape callers see or anything in the extension.
//
//   2. Atlus's own convenience endpoints (/api/atlus/...), which the
//      extension actually talks to. These wrap the Bitrefill calls so the
//      extension never needs to know Bitrefill exists at all, only Atlus's
//      own API shape, which won't change when the mock is replaced.
//
// Card details returned here are obviously fake test data (Stripe's
// well-known 4242... test number), never anything resembling a real card.

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// Minimal CORS. The extension's service worker doesn't strictly need this
// (host_permissions in manifest.json already lets it fetch cross-origin
// without a preflight block), but any other client hitting this server
// directly, browser-based tooling, a future dashboard, will.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const FEE_MULTIPLIER = 1.05; // 5% fee on top of the card's fiat value

// invoiceId -> { id, productId, amount, currency, cryptoCurrency,
//                paymentAddress, amountCrypto, status, cardDetails }
const invoices = new Map();

function generateMockCard() {
  return {
    number: "4242424242424242", // Stripe's well-known test number: obviously fake, never real
    expiry: "12/30",
    cvv: "123",
  };
}

function createInvoice({ productId, amount, currency, cryptoCurrency }) {
  const id = `inv_${crypto.randomBytes(6).toString("hex")}`;
  const paymentAddress = `bitrefill_mock_${crypto.randomBytes(10).toString("hex")}`;
  const amountCrypto = Math.round(amount * FEE_MULTIPLIER * 100) / 100;

  const invoice = {
    id,
    productId,
    amount,
    currency,
    cryptoCurrency,
    paymentAddress,
    amountCrypto,
    status: "pending",
    // Pre-generated at invoice creation rather than on payment, matching
    // how a real card issuer reserves the card as part of opening the
    // order, not after the fact.
    cardDetails: generateMockCard(),
  };

  invoices.set(id, invoice);
  return invoice;
}

// ---------------------------------------------------------------------
// Mock Bitrefill API (https://api.bitrefill.com/v1/...)
// ---------------------------------------------------------------------

app.post("/api/bitrefill/invoice", (req, res) => {
  const { productId, amount, currency, cryptoCurrency } = req.body ?? {};

  if (!amount || !currency) {
    return res.status(400).json({ error: "amount and currency are required" });
  }

  const invoice = createInvoice({
    productId: productId ?? `visa-${amount}-${String(currency).toLowerCase()}`,
    amount,
    currency,
    cryptoCurrency: cryptoCurrency ?? "USDT",
  });

  res.json({
    id: invoice.id,
    paymentAddress: invoice.paymentAddress,
    amountCrypto: invoice.amountCrypto,
    status: invoice.status,
  });
});

app.get("/api/bitrefill/invoice/:id", (req, res) => {
  const invoice = invoices.get(req.params.id);
  if (!invoice) return res.status(404).json({ error: "invoice not found" });

  const body = { id: invoice.id, status: invoice.status };
  if (invoice.status === "paid") {
    body.cardDetails = invoice.cardDetails;
  }
  res.json(body);
});

// Not a real Bitrefill endpoint. Stands in for "the user's wallet actually
// sent the crypto and it settled" until real payment detection exists.
app.post("/api/bitrefill/simulate-payment", (req, res) => {
  const { invoiceId } = req.body ?? {};
  const invoice = invoices.get(invoiceId);
  if (!invoice) return res.status(404).json({ error: "invoice not found" });

  invoice.status = "paid";
  res.json({ id: invoice.id, status: invoice.status });
});

// ---------------------------------------------------------------------
// Atlus convenience endpoints. The extension only ever calls these two,
// never the /api/bitrefill/* endpoints directly, so swapping the
// underlying card provider later never touches extension code.
// ---------------------------------------------------------------------

app.post("/api/atlus/create-payment", (req, res) => {
  const { amountFiat, currency } = req.body ?? {};

  if (!amountFiat || !currency) {
    return res.status(400).json({ error: "amountFiat and currency are required" });
  }

  const invoice = createInvoice({
    productId: `visa-${amountFiat}-${String(currency).toLowerCase()}`,
    amount: amountFiat,
    currency,
    cryptoCurrency: "USDT",
  });

  res.json({
    invoiceId: invoice.id,
    paymentAddress: invoice.paymentAddress,
    amountCrypto: invoice.amountCrypto,
  });
});

app.post("/api/atlus/complete-payment", (req, res) => {
  const { invoiceId } = req.body ?? {};
  const invoice = invoices.get(invoiceId);
  if (!invoice) return res.status(404).json({ error: "invoice not found" });

  // Real flow: the user's wallet sends amountCrypto to paymentAddress here,
  // and this step polls GET /api/bitrefill/invoice/:id until status is
  // "paid" before releasing card details. Nothing moves real crypto in
  // this mock, so it marks the invoice paid directly instead of polling
  // for a payment that was never actually sent.
  invoice.status = "paid";

  res.json({
    cardNumber: invoice.cardDetails.number,
    expiry: invoice.cardDetails.expiry,
    cvv: invoice.cardDetails.cvv,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Atlus Pay coordinator (mock Bitrefill) listening on http://localhost:${PORT}`);
});
