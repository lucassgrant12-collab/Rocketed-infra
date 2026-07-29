// content.js — Atlus Pay content script
//
// Runs on every page (see manifest.json). Detects a checkout form, injects
// a "Pay with Atlus" button next to the card number field, and later fills
// that same form once the background script hands back virtual card
// details from the coordinator.

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

let injected = false;

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

  // Fallback: scan short text nodes that mention "total" for a dollar amount,
  // since not every checkout page uses a predictable selector or test id.
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

  cardNumberField.insertAdjacentElement("beforebegin", button);
  injected = true;
}

function onPayClick() {
  const amount = findTotal() ?? "Amount not detected";
  chrome.runtime.sendMessage({
    action: "initiatePayment",
    amount,
    merchant: window.location.hostname,
  });
}

function setNativeValue(field, value) {
  // Plain `field.value = x` is ignored by React/Vue-controlled inputs
  // because it bypasses their tracked native setter. Calling the
  // prototype's setter directly, then dispatching input/change, makes the
  // page's own framework see it as a real edit instead of a no-op.
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

function fillCard({ cardNumber, expiry, cvv }) {
  const cardField = findField(CARD_NUMBER_SELECTORS);
  const expiryField = findField(EXPIRY_SELECTORS);
  const cvvField = findField(CVV_SELECTORS);

  if (cardField) setNativeValue(cardField, cardNumber);
  if (expiryField) setNativeValue(expiryField, expiry);
  if (cvvField) setNativeValue(cvvField, cvv);
}

function scanForCheckoutForm() {
  const cardNumberField = findField(CARD_NUMBER_SELECTORS);
  if (cardNumberField) injectButton(cardNumberField);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "fillCard") {
    fillCard(message);
  }
});

scanForCheckoutForm();

// Checkout forms often render after the initial page load (SPA checkouts,
// async payment steps), so keep watching instead of scanning once.
const observer = new MutationObserver(() => {
  if (!injected) scanForCheckoutForm();
});
observer.observe(document.body, { childList: true, subtree: true });
