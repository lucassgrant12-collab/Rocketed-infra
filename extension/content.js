// content.js - Atlus Pay content script
//
// Runs on every page (see manifest.json). Detects a checkout form, injects
// a "Pay with Atlus" button, and on click shows a full-page overlay that
// drives the whole payment: wallet connect, a real USDC payment on Base
// to Bitrefill, waiting for the card to be issued, then filling it into
// the page's own form fields. The user never sees the card details
// themselves, only progress messages.
//
// Real money moves in this flow. See injected.js for why wallet calls go
// through a separate page-world script instead of touching
// window.ethereum from here directly.
//
// USDC was chosen over native ETH after ETH's payment amount turned out
// to be ambiguous: Bitrefill's invoice response returns a raw integer
// with no documented unit, and no standard Ethereum denomination (wei,
// gwei) produced a plausible dollar value for it. USDC's unit is not
// something either of us has to guess at: it's a fixed, universal
// 6-decimal ERC-20 standard, and cross-checking against Bitcoin's
// (also fixed, 8-decimal satoshi) response confirmed the pattern: price
// is in the currency's own smallest standard unit. See RESEARCH.md for
// the full investigation.

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

const BUTTON_ID = "atlus-pay-btn";
const WALLET_BRIDGE_MARKER = "atlus-pay-wallet-bridge";

let injected = false;

// ---------------------------------------------------------------------
// Checkout detection and card fill (unchanged from the earlier version)
// ---------------------------------------------------------------------

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

function injectButton(cardNumberField) {
  if (injected || document.getElementById(BUTTON_ID)) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "Pay with Atlus";
  button.addEventListener("click", onPayClick);

  cardNumberField.insertAdjacentElement("beforebegin", button);
  injected = true;
}

function setNativeValue(field, value) {
  const prototype = Object.getPrototypeOf(field);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(field, value);
  } else {
    field.value = value;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillCard({ number, expiry, cvv }) {
  const cardField = findField(CARD_NUMBER_SELECTORS);
  const expiryField = findField(EXPIRY_SELECTORS);
  const cvvField = findField(CVV_SELECTORS);

  if (cardField) setNativeValue(cardField, number);
  if (expiryField) setNativeValue(expiryField, expiry);
  if (cvvField) setNativeValue(cvvField, cvv);

  // Deliberately does not auto-submit the merchant's form. Real crypto was
  // just spent and a real card was just issued; final submission stays a
  // manual, visible action the user takes themselves.
}

function scanForCheckoutForm() {
  const cardNumberField = findField(CARD_NUMBER_SELECTORS);
  if (cardNumberField) injectButton(cardNumberField);
}

scanForCheckoutForm();

const observer = new MutationObserver(() => {
  if (!injected) scanForCheckoutForm();
});
observer.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------
// Wallet bridge: talks to injected.js (page world) over postMessage.
// See injected.js for why this indirection exists.
// ---------------------------------------------------------------------

let walletRequestCounter = 0;
const pendingWalletRequests = new Map();

let pageBridgeReady = null;

// Injecting the <script> tag is asynchronous: the browser has to fetch and
// execute injected.js before its message listener exists. Sending a
// postMessage before that listener is registered loses the message
// silently (postMessage doesn't queue for a listener that isn't there
// yet), so callers must await this before using callWallet().
function injectPageBridge() {
  if (pageBridgeReady) return pageBridgeReady;

  pageBridgeReady = new Promise((resolve, reject) => {
    const existing = document.getElementById("atlus-pay-injected-bridge");
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "atlus-pay-injected-bridge";
    script.src = chrome.runtime.getURL("injected.js");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Failed to load injected.js")));
    (document.head || document.documentElement).appendChild(script);
  });

  return pageBridgeReady;
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== WALLET_BRIDGE_MARKER || event.data?.direction !== "to-content") return;

  const { requestId, result, error } = event.data;
  const pending = pendingWalletRequests.get(requestId);
  if (!pending) return;
  pendingWalletRequests.delete(requestId);

  if (error) pending.reject(new Error(error));
  else pending.resolve(result);
});

function callWallet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${++walletRequestCounter}_${Date.now()}`;
    pendingWalletRequests.set(requestId, { resolve, reject });

    window.postMessage(
      { source: WALLET_BRIDGE_MARKER, direction: "to-page", requestId, action, params },
      window.location.origin
    );

    setTimeout(() => {
      if (pendingWalletRequests.has(requestId)) {
        pendingWalletRequests.delete(requestId);
        reject(new Error(`Wallet request "${action}" timed out.`));
      }
    }, 60000);
  });
}

function requestFromBackground(action, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response ?? {});
    });
  });
}

// ---------------------------------------------------------------------
// USDC on Base: chain id, contract address, and minimal ERC-20 ABI
// encoding. No ethers.js (see RESEARCH.md), just the two selectors and
// the encoding rules the ERC-20 standard itself defines, which don't
// change per token and are safe to hardcode.
// ---------------------------------------------------------------------

const BASE_CHAIN_ID = "0x2105"; // 8453 decimal
// Verified directly against Circle's own contract address docs and
// cross-checked on BaseScan before use, this is native USDC on Base, not
// the older bridged USDbC token (a real, easy mix-up with a different
// contract address).
const USDC_ADDRESS_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

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

// Formats a raw base-unit integer (as returned by eth_call, or as sent by
// the coordinator) into a human-readable decimal string for display only,
// never used for anything that determines how much actually gets sent.
function formatTokenAmount(baseUnits, decimals) {
  // eth_call can return a bare "0x" for an all-zero result on some nodes,
  // which BigInt() rejects outright rather than treating as zero.
  const value = baseUnits === "0x" || !baseUnits ? 0n : BigInt(baseUnits);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

// ---------------------------------------------------------------------
// The full-page overlay
// ---------------------------------------------------------------------

function buildOverlay(amountUsd) {
  const overlay = document.createElement("div");
  overlay.id = "atlus-overlay";
  overlay.innerHTML = `
    <div id="atlus-overlay-modal">
      <h2>Pay with Atlus</h2>
      <div id="atlus-overlay-amount">$${amountUsd}</div>
      <p id="atlus-overlay-currency-label">Paying with USDC (Base)</p>
      <div id="atlus-overlay-warning">
        This sends real USDC from your connected wallet to purchase a real prepaid card. Confirm the exact amount shown in your wallet before approving.
      </div>
      <div id="atlus-overlay-balance">Connecting wallet...</div>
      <div class="atlus-overlay-actions">
        <button type="button" class="atlus-overlay-btn" id="atlus-overlay-cancel-btn">Cancel</button>
        <button type="button" class="atlus-overlay-btn" id="atlus-overlay-confirm-btn" disabled>Confirm Payment</button>
      </div>
      <div id="atlus-overlay-status"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setProgress(overlay, text) {
  const el = overlay.querySelector("#atlus-overlay-status");
  // innerHTML here is safe: `text` is always one of this file's own
  // hardcoded progress strings below, never external or user-controlled
  // data. Errors and anything that might echo external text use
  // setError()/textContent instead.
  el.innerHTML = `<span class="atlus-overlay-spinner"></span>${text}`;
  el.className = "";
}

function setError(overlay, text) {
  const el = overlay.querySelector("#atlus-overlay-status");
  el.textContent = text;
  el.className = "error";
}

function setSuccess(overlay, text) {
  const el = overlay.querySelector("#atlus-overlay-status");
  el.textContent = text;
  el.className = "success";
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

  const overlay = buildOverlay(amount);
  const confirmBtn = overlay.querySelector("#atlus-overlay-confirm-btn");
  const cancelBtn = overlay.querySelector("#atlus-overlay-cancel-btn");
  const balanceEl = overlay.querySelector("#atlus-overlay-balance");

  cancelBtn.addEventListener("click", () => removeOverlay(overlay));

  let account = null;

  try {
    await injectPageBridge();
    const { accounts } = await callWallet("requestAccounts");
    account = accounts?.[0];
    if (!account) throw new Error("No wallet account was returned.");

    const { chainId } = await callWallet("getChainId");
    if (chainId !== BASE_CHAIN_ID) {
      balanceEl.textContent = "Switching to Base...";
      await callWallet("switchChain", { chainId: BASE_CHAIN_ID });
    }

    const { result: balanceHex } = await callWallet("ethCall", {
      to: USDC_ADDRESS_BASE,
      data: erc20BalanceOfCalldata(account),
    });
    balanceEl.textContent = `Wallet balance: ${formatTokenAmount(balanceHex, USDC_DECIMALS)} USDC`;
    confirmBtn.disabled = false;
  } catch (error) {
    balanceEl.textContent = "Could not connect to wallet.";
    setError(overlay, error.message);
    return;
  }

  confirmBtn.addEventListener("click", () => runPayment(overlay, amount, account));
}

async function runPayment(overlay, amountUsd, account) {
  const confirmBtn = overlay.querySelector("#atlus-overlay-confirm-btn");
  const cancelBtn = overlay.querySelector("#atlus-overlay-cancel-btn");
  const balanceEl = overlay.querySelector("#atlus-overlay-balance");
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

  let invoice;
  try {
    setProgress(overlay, "Creating payment...");
    invoice = await requestFromBackground("createPayment", { amountFiat: Number(amountUsd) });
    if (invoice.error) throw new Error(invoice.error);
  } catch (error) {
    setError(overlay, error.message);
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    return;
  }

  // Fixed-denomination cards (e.g. $10/$50/$100/$250) can cost more than
  // the actual checkout total, the difference is real money that isn't
  // refunded. That has to be an explicit, visible checkpoint before any
  // transaction is sent, not buried in a progress message.
  const cardValue = Number(invoice.cardValue);
  const checkoutTotal = Number(amountUsd);
  if (invoice.cardCurrency && cardValue > checkoutTotal) {
    const difference = (cardValue - checkoutTotal).toFixed(2);
    balanceEl.textContent = `This purchases a ${cardValue} ${invoice.cardCurrency} card for a ${checkoutTotal} checkout. The ${difference} ${invoice.cardCurrency} difference is not refunded.`;
  } else if (invoice.cardCurrency) {
    balanceEl.textContent = `Card value: ${cardValue} ${invoice.cardCurrency}.`;
  }

  setProgress(overlay, "");
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
    setProgress(overlay, "Confirm the transaction in your wallet...");
    // invoice.amountCrypto is already a raw USDC base-unit integer (e.g.
    // 7190000 = 7.19 USDC), confirmed directly against Bitrefill's real
    // response, not something this file needs to convert from a decimal.
    const { txHash } = await callWallet("sendTransaction", {
      from: account,
      to: USDC_ADDRESS_BASE,
      data: erc20TransferCalldata(invoice.paymentAddress, Math.round(invoice.amountCrypto)),
    });

    setProgress(overlay, "Payment sent. Waiting for confirmation...");
    const result = await requestFromBackground("pollUntilPaid", { invoiceId: invoice.invoiceId });
    if (result.error) throw new Error(result.error);
    if (result.status !== "paid") throw new Error(`Payment ${result.status}. You can try again.`);

    fillCard(result.card);

    requestFromBackground("recordTransaction", {
      walletAddress: account,
      amount: amountUsd,
      merchant: window.location.hostname,
      cardLast4: result.card.number.slice(-4),
    }).catch(() => {});

    setSuccess(overlay, "Payment confirmed. Card filled in below.");
    setTimeout(() => removeOverlay(overlay), 2500);
  } catch (error) {
    setError(overlay, error.message);
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
  }
}
