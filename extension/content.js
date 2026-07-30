// content.js - Atlus Pay content script
//
// Runs on every page (see manifest.json). Detects a checkout form, injects
// a "Pay with Atlus" button, and on click shows a full-page overlay that
// drives the whole payment: wallet connect, a real Ethereum mainnet
// payment to Bitrefill, waiting for the card to be issued, then filling
// it into the page's own form fields. The user never sees the card
// details themselves, only progress messages.
//
// Real money moves in this flow. See injected.js for why wallet calls go
// through a separate page-world script instead of touching
// window.ethereum from here directly.

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

// Precise decimal ETH <-> wei conversion via BigInt, no floating point.
// Getting this wrong moves the wrong amount of real money, so it's kept
// as one small, directly readable function rather than pulled in from a
// third-party library.
function ethToWeiHex(ethAmountStr) {
  const [wholeRaw, fractionRaw = ""] = String(ethAmountStr).split(".");
  const whole = wholeRaw || "0";
  const fraction = (fractionRaw + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction || "0");
  return "0x" + wei.toString(16);
}

function weiHexToEthDisplay(weiHex) {
  const wei = BigInt(weiHex);
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
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
      <p id="atlus-overlay-currency-label">Paying with Ethereum (mainnet)</p>
      <div id="atlus-overlay-warning">
        This sends real ETH from your connected wallet to purchase a real prepaid card. Confirm the exact amount shown in your wallet before approving.
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
    if (chainId !== "0x1") {
      balanceEl.textContent = "Switching to Ethereum mainnet...";
      await callWallet("switchToMainnet");
    }

    const { balanceWeiHex } = await callWallet("getBalance", { address: account });
    balanceEl.textContent = `Wallet balance: ${weiHexToEthDisplay(balanceWeiHex)} ETH`;
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
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;

  try {
    setProgress(overlay, "Creating payment...");
    const invoice = await requestFromBackground("createPayment", { amountFiat: Number(amountUsd) });
    if (invoice.error) throw new Error(invoice.error);

    setProgress(overlay, "Confirm the transaction in your wallet...");
    const valueWeiHex = ethToWeiHex(invoice.amountCrypto);
    const { txHash } = await callWallet("sendTransaction", {
      from: account,
      to: invoice.paymentAddress,
      valueWeiHex,
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
