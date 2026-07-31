// checkout.js - Atlus Pay desktop app, THE preload script for the
// BrowserView (see main.js's `preload: path.join(__dirname, "inject",
// "checkout.js")`)
//
// Runs on every page the user navigates to inside the app, the same job
// extension/content.js does in the browser extension version. Detects a
// checkout form, injects a "Pay with Atlus" button, and on click shows a
// full-page overlay that connects a wallet via WalletConnect (a QR code,
// not an injected provider, see README for why), buys a real gift card
// for whatever retailer the user is actually on (see
// coordinator/retailers.js), pays for it with real USDC on Base, then
// fills the resulting code back into the checkout page.
//
// Originally ported directly from extension/content.js, since diverged:
// the card-issuing model changed from a single fixed-denomination Visa
// card to a per-retailer gift card matched by domain, with an exact
// custom amount wherever the product supports one (most do). See
// RESEARCH.md's 2026-07-31 entries for why. The overlay UI, ERC-20
// calldata encoding, and WalletConnect flow are still unchanged from that
// port.
//
// This file is both privileged (it's a preload script, so require()
// works, unlike a normal web page) and shares the DOM/window of whatever
// page is loaded, unlike the extension, there's no separate "isolated
// world" to bridge here, so wallet calls go straight through ipcRenderer
// with no contextBridge indirection needed, that indirection was a
// Chrome-extension-specific requirement this file doesn't have.

const { ipcRenderer } = require("electron");
const QRCode = require("qrcode");

const COORDINATOR_URL = "http://localhost:3001";
const WEBSITE_URL = "http://localhost:3000";
const BASE_RPC_URL = "https://mainnet.base.org"; // Base's official public RPC

// Most retailers in retailers.js issue their own store gift card, not a
// Visa-network card, once Atlus pays for it. Those redeem through a
// "gift card / promo code" field, not the credit-card fields below.
// There's no HTML autocomplete token for this the way there is for
// credit cards (autocomplete="cc-number" etc), so detection here is
// inherently best-effort, checked first since it's now the common case.
const GIFT_CARD_CODE_SELECTORS = [
  'input[name*="giftcard" i]',
  'input[id*="giftcard" i]',
  'input[name*="gift-card" i]',
  'input[id*="gift-card" i]',
  'input[name*="gift_card" i]',
  'input[id*="gift_card" i]',
  'input[placeholder*="gift card" i]',
  'input[name*="promo" i]',
  'input[id*="promo" i]',
  'input[placeholder*="promo code" i]',
  'input[name*="voucher" i]',
  'input[id*="voucher" i]',
];

// Kept for a Visa-shaped product, if one's ever added back to the
// catalog (see RESEARCH.md on why the two Visa products tried so far
// didn't work out). Checked second, after gift-card fields.
const CARD_NUMBER_SELECTORS = [
  'input[autocomplete="cc-number"]',
  'input[name*="cardnumber" i]',
  'input[name*="card-number" i]',
  'input[id*="cardnumber" i]',
  'input[id*="card-number" i]',
  'input[name*="cc-number" i]',
];

const EXPIRY_SELECTORS = [
  'input[autocomplete="cc-exp"]',
  'input[name*="expiry" i]',
  'input[name*="exp-date" i]',
  'input[id*="expiry" i]',
];

const CVV_SELECTORS = [
  'input[autocomplete="cc-csc"]',
  'input[name*="cvc" i]',
  'input[name*="cvv" i]',
  'input[id*="cvc" i]',
  'input[id*="cvv" i]',
];

const TOTAL_SELECTORS = ['[data-testid="total"]', '.order-total', '#total', '[data-testid="order-total"]'];

const FIRST_NAME_SELECTORS = ['input[autocomplete="given-name"]', 'input[name*="first" i][name*="name" i]'];
const LAST_NAME_SELECTORS = ['input[autocomplete="family-name"]', 'input[name*="last" i][name*="name" i]'];
const ADDRESS_LINE1_SELECTORS = ['input[autocomplete="address-line1"]', 'input[name*="address1" i]', 'input[name*="address_1" i]'];
const ADDRESS_LINE2_SELECTORS = ['input[autocomplete="address-line2"]', 'input[name*="address2" i]', 'input[name*="address_2" i]'];
const CITY_SELECTORS = ['input[autocomplete="address-level2"]', 'input[name*="city" i]'];
const STATE_SELECTORS = ['input[autocomplete="address-level1"]', 'select[autocomplete="address-level1"]', 'input[name*="state" i]', 'select[name*="state" i]'];
const ZIP_SELECTORS = ['input[autocomplete="postal-code"]', 'input[name*="zip" i]', 'input[name*="postal" i]'];

const BUTTON_ID = "atlus-pay-btn";

// Best-effort signals that a merchant already accepts crypto directly
// through their own checkout, in which case Atlus buying a gift card on
// top of that would be strictly worse for the user (extra step, possible
// rounding waste) than just paying the merchant's own way. Checked
// against script/iframe src and link hrefs on the page. This can produce
// false negatives (a gateway not on this list) but not false positives -
// each of these is a specific vendor's own domain, not a generic pattern.
const DIRECT_CRYPTO_MARKERS = [
  "commerce.coinbase.com",
  "bitpay.com",
  "opennode.com",
  "coingate.com",
  "nowpayments.io",
  "btcpay",
  "strike.me",
];

const USDC_ADDRESS_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

let injected = false;

// ---------------------------------------------------------------------
// Merchant compatibility check - best effort only. This can reduce the
// chance of spending crypto on a card a merchant then rejects, it cannot
// guarantee it: there's no reliable client-side way to know whether a
// specific gateway's BIN-range region lock will accept a given prepaid
// card without actually attempting the charge. What it can check for
// real, from the DOM alone: a domain the user has personally blocklisted
// after a past rejection, and a billing-country field that doesn't even
// list the country the card is billed from.
// ---------------------------------------------------------------------

function checkBillingCountryField() {
  const countrySelect = document.querySelector(
    'select[name*="country" i], select[id*="country" i], select[autocomplete="country"]'
  );
  if (!countrySelect) return null;
  const options = [...countrySelect.options].map((o) => o.textContent.trim().toLowerCase());
  const hasUS = options.some((o) => o === "united states" || o === "us" || o === "usa" || o === "united states of america");
  if (options.length && !hasUS) {
    return "This checkout's billing country field has no United States option";
  }
  return null;
}

// targetType matters here: the billing-country check only makes sense for
// a Visa-shaped card (AVS-style region lock). A store gift card isn't a
// payment card and has no AVS check, so that heuristic would just be
// noise for the common case now.
async function checkMerchantCompatibility(targetType) {
  const settings = await ipcRenderer.invoke("settings:get");
  const hostname = window.location.hostname.replace(/^www\./, "");
  const blocklist = settings.merchantBlocklist || [];
  const reasons = [];

  if (blocklist.some((d) => hostname === d || hostname.endsWith("." + d))) {
    reasons.push(`${hostname} is on your merchant blocklist`);
  }

  if (targetType === "creditcard") {
    const countryIssue = checkBillingCountryField();
    if (countryIssue) reasons.push(countryIssue);
  }

  return { compatible: reasons.length === 0, reasons };
}

// Best-effort: does this page already look like it takes crypto directly?
// If so, buying an Atlus gift card is strictly worse for the user (an
// extra conversion step, possible rounding waste) than just using the
// merchant's own crypto checkout. Checked against script/iframe src and
// link hrefs across the page, not just the visible form.
function detectDirectCryptoAcceptance() {
  const sources = [
    ...document.querySelectorAll("script[src], iframe[src]"),
  ].map((el) => el.src);
  const links = [...document.querySelectorAll("a[href]")].map((el) => el.href);
  const haystack = [...sources, ...links].join(" ").toLowerCase();
  return DIRECT_CRYPTO_MARKERS.some((marker) => haystack.includes(marker));
}

// Asks the coordinator whether retailers.js has a real, verified product
// for the site the user is actually on. No fuzzy matching happens here or
// in the coordinator, only an exact domain/subdomain match against a
// hand-curated list (see coordinator/retailers.js).
async function matchRetailer() {
  const hostname = window.location.hostname;
  try {
    const response = await fetch(`${COORDINATOR_URL}/api/atlus/match?domain=${encodeURIComponent(hostname)}`);
    const data = await response.json();
    return data.retailer || null;
  } catch {
    return null;
  }
}

function findField(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function findTotal() {
  for (const selector of TOTAL_SELECTORS) {
    const el = document.querySelector(selector);
    const match = el?.textContent?.match(/[\d,]+\.\d{2}/);
    if (match) return match[0];
  }
  const candidates = document.querySelectorAll("strong, span, td, div");
  for (const el of candidates) {
    if (el.children.length === 0 && /total/i.test(el.textContent) && el.textContent.length < 40) {
      const match = el.textContent.match(/[\d,]+\.\d{2}/);
      if (match) return match[0];
    }
  }
  return null;
}

function injectButton(anchorField) {
  if (injected || document.getElementById(BUTTON_ID)) return;
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "Pay with Atlus";
  button.style.cssText = [
    "display:block",
    "margin:8px 0",
    "padding:10px 16px",
    "background:#171717",
    "color:#fff",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px",
    "font-weight:600",
    "border:none",
    "border-radius:8px",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", onPayClick);
  anchorField.insertAdjacentElement("beforebegin", button);
  injected = true;
}

function setNativeValue(field, value) {
  const prototype = Object.getPrototypeOf(field);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (nativeSetter) nativeSetter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

// Finds whatever field the redeemed card/code should go into, checked in
// priority order: a gift-card/promo-code field first (the common case for
// retailers.js's store gift cards), a Visa-shaped card-number field
// second (for a future card-network product, if one's ever added back).
// Returns null if the checkout page has neither, in which case there's
// nowhere to anchor the button at all.
function findRedemptionTarget() {
  const giftCardField = findField(GIFT_CARD_CODE_SELECTORS);
  if (giftCardField) return { type: "giftcard", field: giftCardField };

  const cardField = findField(CARD_NUMBER_SELECTORS);
  if (cardField) return { type: "creditcard", field: cardField };

  return null;
}

// No auto-submit either way, same reasoning as the extension: real money
// was just spent, final submission stays a manual, visible click.
function fillRedemption(target, redemption) {
  if (target.type === "giftcard") {
    if (redemption.kind === "code" && redemption.code) {
      setNativeValue(target.field, redemption.code);
    }
    return;
  }

  if (target.type === "creditcard" && redemption.kind === "creditcard") {
    const expiryField = findField(EXPIRY_SELECTORS);
    const cvvField = findField(CVV_SELECTORS);
    setNativeValue(target.field, redemption.number);
    if (expiryField) setNativeValue(expiryField, redemption.expiry);
    if (cvvField) setNativeValue(cvvField, redemption.cvv);
  }
}

// Fills whatever billing-address fields the checkout form has from the
// user's own settings (see shell/settings.html). Only fills fields that
// are actually present and only with values the user actually entered,
// nothing here is auto-generated or defaulted.
function fillBillingAddress(settings) {
  const fieldMap = [
    [FIRST_NAME_SELECTORS, settings.cardholderFirstName],
    [LAST_NAME_SELECTORS, settings.cardholderLastName],
    [ADDRESS_LINE1_SELECTORS, settings.billingAddressLine1],
    [ADDRESS_LINE2_SELECTORS, settings.billingAddressLine2],
    [CITY_SELECTORS, settings.billingCity],
    [STATE_SELECTORS, settings.billingState],
    [ZIP_SELECTORS, settings.billingZip],
  ];
  for (const [selectors, value] of fieldMap) {
    if (!value) continue;
    const field = findField(selectors);
    if (field) setNativeValue(field, value);
  }
}

let currentTarget = null;

function scanForCheckoutForm() {
  const target = findRedemptionTarget();
  if (target) {
    currentTarget = target;
    injectButton(target.field);
  }
}

// Preload scripts run before the page's HTML has been parsed, so
// document.documentElement can still be null here, unlike a browser
// extension content script (which Chrome only runs once the DOM exists).
// Deferring to DOMContentLoaded when needed avoids throwing out of the
// preload script entirely, which was breaking the rest of the page.
function initCheckoutDetection() {
  scanForCheckoutForm();
  new MutationObserver(() => {
    if (!injected) scanForCheckoutForm();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCheckoutDetection);
} else {
  initCheckoutDetection();
}

// ---------------------------------------------------------------------
// ERC-20 ABI encoding (identical to the extension version)
// ---------------------------------------------------------------------

function encodeAddressParam(address) {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

function encodeUint256Param(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function erc20BalanceOfCalldata(address) {
  return ERC20_BALANCE_OF_SELECTOR + encodeAddressParam(address);
}

function erc20TransferCalldata(to, amountBaseUnits) {
  return ERC20_TRANSFER_SELECTOR + encodeAddressParam(to) + encodeUint256Param(amountBaseUnits);
}

function formatTokenAmount(baseUnits, decimals) {
  const value = baseUnits === "0x" || !baseUnits ? 0n : BigInt(baseUnits);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

// Balance is public on-chain data, no wallet permission needed to read
// it, so this goes straight to a public RPC instead of through the
// WalletConnect session (which is reserved for the signed transfer).
async function readUsdcBalance(address) {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: USDC_ADDRESS_BASE, data: erc20BalanceOfCalldata(address) }, "latest"],
    }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(error.message || "Failed to read USDC balance");
  return result;
}

function requestFromServer(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

// ---------------------------------------------------------------------
// The full-page overlay
// ---------------------------------------------------------------------

function buildOverlay(amountUsd) {
  const overlay = document.createElement("div");
  overlay.id = "atlus-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
  overlay.innerHTML = `
    <div id="atlus-overlay-modal" style="width:360px;max-width:calc(100vw - 32px);background:#fff;border-radius:16px;padding:28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h2 style="margin:0 0 4px;font-size:16px;font-weight:700;color:#171717;">Pay with Atlus</h2>
      <div id="atlus-overlay-amount" style="margin:12px 0 4px;font-size:30px;font-weight:700;color:#171717;">$${amountUsd}</div>
      <p style="margin:0 0 20px;font-size:13px;color:#737373;">Paying with USDC (Base)</p>
      <div id="atlus-overlay-qr" style="display:none;margin:0 auto 16px;"></div>
      <div id="atlus-overlay-warning" style="margin:0 0 16px;padding:10px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:12px;line-height:1.4;text-align:left;">
        This sends real USDC from your connected wallet to purchase a real prepaid card. Confirm the exact amount shown in your wallet app before approving.
      </div>
      <div id="atlus-overlay-balance" style="margin:0 0 16px;font-size:13px;color:#525252;">Scan the QR code with a WalletConnect-compatible wallet...</div>
      <div id="atlus-overlay-code" style="display:none;margin:0 0 16px;padding:10px 12px;border-radius:8px;background:#f5f5f5;font-family:monospace;font-size:13px;word-break:break-all;text-align:left;"></div>
      <div style="display:flex;gap:8px;">
        <button type="button" id="atlus-overlay-cancel-btn" style="flex:1;padding:11px;font-size:14px;font-weight:600;border:none;border-radius:8px;cursor:pointer;background:#f5f5f5;color:#171717;">Cancel</button>
        <button type="button" id="atlus-overlay-confirm-btn" disabled style="flex:1;padding:11px;font-size:14px;font-weight:600;border:none;border-radius:8px;cursor:pointer;background:#171717;color:#fff;opacity:0.5;">Confirm Payment</button>
      </div>
      <div id="atlus-overlay-status" style="margin-top:16px;min-height:18px;font-size:13px;color:#525252;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setStatus(overlay, text, kind) {
  const el = overlay.querySelector("#atlus-overlay-status");
  el.textContent = text || "";
  el.style.color = kind === "error" ? "#dc2626" : kind === "success" ? "#16a34a" : "#525252";
}

function removeOverlay(overlay) {
  overlay.remove();
}

async function onPayClick() {
  const amount = findTotal();
  if (!amount) {
    alert("Atlus Pay could not detect the order total on this page.");
    return;
  }
  const target = currentTarget;
  if (!target) {
    alert("Atlus Pay could not find a card or gift-card field to fill on this page.");
    return;
  }

  const overlay = buildOverlay(amount);
  const confirmBtn = overlay.querySelector("#atlus-overlay-confirm-btn");
  const cancelBtn = overlay.querySelector("#atlus-overlay-cancel-btn");
  const balanceEl = overlay.querySelector("#atlus-overlay-balance");
  const qrEl = overlay.querySelector("#atlus-overlay-qr");

  cancelBtn.addEventListener("click", () => removeOverlay(overlay));

  // Priority order, checked before any wallet is ever connected, so
  // nothing below the first blocking check gets a chance to spend crypto:
  //   1. Merchant already takes crypto directly - Atlus buying a gift
  //      card on top of that would be strictly worse for the user.
  //   2. A verified retailer product exists for this exact site.
  //   3. Neither - Atlus doesn't support this checkout yet.
  setStatus(overlay, "Checking this checkout...");

  if (detectDirectCryptoAcceptance()) {
    balanceEl.textContent =
      "This site looks like it already accepts crypto directly at checkout. Atlus doesn't need to buy a gift card here, look for a crypto payment option on this page.";
    setStatus(overlay, "");
    confirmBtn.remove();
    return;
  }

  const retailer = await matchRetailer();
  if (!retailer) {
    balanceEl.textContent = `Atlus doesn't support ${window.location.hostname.replace(/^www\./, "")} yet.`;
    setStatus(overlay, "");
    confirmBtn.remove();
    return;
  }

  const { compatible, reasons } = await checkMerchantCompatibility(target.type);
  if (!compatible) {
    balanceEl.textContent = "This merchant may not accept the Atlus card.";
    setStatus(overlay, reasons.join(" "), "error");
    confirmBtn.remove();
    return;
  }
  setStatus(overlay, "");

  let account = null;

  try {
    const { uri, sessionId } = await ipcRenderer.invoke("wallet:connect");
    await renderQrCode(qrEl, uri);
    qrEl.style.display = "block";

    setStatus(overlay, "Waiting for wallet approval...");
    const { address } = await ipcRenderer.invoke("wallet:awaitApproval", sessionId);
    account = address;
    qrEl.style.display = "none";
    setStatus(overlay, "");

    const balanceHex = await readUsdcBalance(account);
    balanceEl.textContent = `Wallet balance: ${formatTokenAmount(balanceHex, USDC_DECIMALS)} USDC`;
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = "1";
  } catch (error) {
    balanceEl.textContent = "Could not connect to wallet.";
    setStatus(overlay, error.message, "error");
    return;
  }

  confirmBtn.addEventListener("click", () => runPayment(overlay, amount, account, target, retailer.productId));
}

async function runPayment(overlay, amountUsd, account, target, productId) {
  const confirmBtn = overlay.querySelector("#atlus-overlay-confirm-btn");
  const cancelBtn = overlay.querySelector("#atlus-overlay-cancel-btn");
  const balanceEl = overlay.querySelector("#atlus-overlay-balance");
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

  let invoice;
  try {
    setStatus(overlay, "Creating payment...");
    invoice = await requestFromServer(`${COORDINATOR_URL}/api/atlus/create-payment`, {
      amountFiat: Number(amountUsd),
      productId,
    });
    if (invoice.error) throw new Error(invoice.error);
  } catch (error) {
    setStatus(overlay, error.message, "error");
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    return;
  }

  const cardValue = Number(invoice.cardValue);
  const checkoutTotal = Number(amountUsd);
  if (!invoice.exact && cardValue > checkoutTotal) {
    const difference = (cardValue - checkoutTotal).toFixed(2);
    balanceEl.textContent = `This purchases a ${cardValue} ${invoice.cardCurrency} card for a ${checkoutTotal} checkout. The ${difference} ${invoice.cardCurrency} difference is not refunded.`;
  } else {
    balanceEl.textContent = `Card value: ${cardValue} ${invoice.cardCurrency}${invoice.exact ? " (exact match, no waste)" : ""}.`;
  }

  setStatus(overlay, "");
  confirmBtn.textContent = "Send Payment";
  confirmBtn.disabled = false;
  cancelBtn.disabled = false;

  const proceed = await new Promise((resolve) => {
    confirmBtn.addEventListener("click", () => resolve(true), { once: true });
    cancelBtn.addEventListener("click", () => resolve(false), { once: true });
  });

  if (!proceed) {
    removeOverlay(overlay);
    return;
  }

  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

  try {
    setStatus(overlay, "Confirm the transaction in your wallet app...");
    const { txHash } = await ipcRenderer.invoke("wallet:sendTransaction", {
      to: USDC_ADDRESS_BASE,
      data: erc20TransferCalldata(invoice.paymentAddress, Math.round(invoice.amountCrypto)),
    });

    setStatus(overlay, "Payment sent. Waiting for confirmation...");
    const result = await requestFromServer(`${COORDINATOR_URL}/api/atlus/poll-until-paid`, {
      invoiceId: invoice.invoiceId,
    });
    if (result.error) throw new Error(result.error);
    if (result.status !== "paid") throw new Error(`Payment ${result.status}. You can try again.`);

    const redemption = result.redemption;
    fillRedemption(target, redemption);

    // The redemption format varies per retailer and hasn't been verified
    // against a real fulfilled order for most of them yet (see
    // RESEARCH.md), so the raw text always gets shown too, not just
    // whatever got auto-filled. If auto-fill didn't find a code to use,
    // this is the only way the user actually gets their card.
    const codeEl = overlay.querySelector("#atlus-overlay-code");
    if (redemption.raw) {
      codeEl.textContent = redemption.raw;
      codeEl.style.display = "block";
    }

    if (target.type === "creditcard") {
      const settings = await ipcRenderer.invoke("settings:get");
      fillBillingAddress(settings);
    }

    requestFromServer(`${WEBSITE_URL}/api/transactions/complete`, {
      walletAddress: account,
      amount: amountUsd,
      merchant: window.location.hostname,
      cardLast4: redemption.kind === "creditcard" ? redemption.number.slice(-4) : null,
    }).catch(() => {});

    setStatus(overlay, "Payment confirmed. Check the code below if it wasn't filled in automatically.", "success");
    setTimeout(() => removeOverlay(overlay), 2500);
  } catch (error) {
    setStatus(overlay, error.message, "error");
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
  }
}

// Renders straight from the locally installed `qrcode` npm package
// (required at the top of this file). Deliberately not loaded from a
// CDN: this script runs on whatever arbitrary checkout page the user has
// open, and pulling a third-party script into that context for
// something payment-adjacent is exactly the kind of unnecessary external
// dependency this project has been avoiding elsewhere (see RESEARCH.md's
// note on why ethers.js wasn't bundled either).
async function renderQrCode(container, text) {
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  await QRCode.toCanvas(canvas, text, { width: 220, margin: 1 });
}
