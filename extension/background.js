// background.js - Atlus Pay service worker
//
// Central message hub. Three sources send messages here:
//   - content.js (on checkout pages)       -> "initiatePayment"
//   - popup.js (the payment window)        -> "confirmPayment", "cancelPayment"
//   - wallet-bridge.js (on the Atlus site) -> "walletConnected", "walletDisconnected"
//
// Payment state (which tab asked, what amount) is transaction-scoped and
// kept in memory - a service worker can be killed and restarted between
// messages, but a single payment's lifetime (click -> confirm -> card
// filled) is a few seconds, so there's nothing worth persisting there.
// The connected wallet address is different: it needs to survive restarts
// and outlive any single payment, so that one value lives in
// chrome.storage.local instead.

const COORDINATOR_URL = "http://localhost:3001"; // coordinator/server.js (mock Bitrefill)
const WEBSITE_URL = "http://localhost:3000"; // the Next.js site (records transactions, sends emails)

let paymentState = null; // { tabId, amount, merchant }
let popupWindowId = null;

chrome.runtime.onMessage.addListener((message, sender) => {
  switch (message.action) {
    case "walletConnected":
      handleWalletConnected(message.address);
      break;
    case "walletDisconnected":
      chrome.storage.local.remove("walletAddress");
      break;
    case "initiatePayment":
      handleInitiatePayment(message, sender);
      break;
    case "confirmPayment":
      handleConfirmPayment(message);
      break;
    case "cancelPayment":
      handleCancelPayment();
      break;
    default:
      break;
  }
  // No branch above uses sendResponse - card details and payment outcomes
  // travel as their own follow-up messages ("fillCard", "paymentSucceeded",
  // "paymentFailed") instead, since they only become available after an
  // async coordinator round trip and, for initiatePayment, after the user
  // acts on the popup. Nothing to keep the message channel open for.
});

async function handleWalletConnected(address) {
  if (!address) return;
  await chrome.storage.local.set({ walletAddress: address });
}

async function handleInitiatePayment(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  paymentState = {
    tabId,
    amount: message.amount,
    merchant: message.merchant,
  };

  const current = await chrome.windows.getCurrent();
  const popupWidth = 400;
  const popupHeight = 320;
  const left = Math.round((current.left ?? 0) + ((current.width ?? popupWidth) - popupWidth) / 2);
  const top = Math.round((current.top ?? 0) + ((current.height ?? popupHeight) - popupHeight) / 2);

  const popup = await chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html?amount=${encodeURIComponent(message.amount)}`),
    type: "popup",
    width: popupWidth,
    height: popupHeight,
    left,
    top,
  });

  popupWindowId = popup.id ?? null;
}

async function handleConfirmPayment(message) {
  if (!paymentState) return;

  // The popup can override the detected amount (e.g. the user typed one
  // in manually because detection failed), so prefer whatever it sends.
  const amount = message.amount ?? paymentState.amount;

  try {
    const { walletAddress } = await chrome.storage.local.get("walletAddress");

    // Step 1: open a payment with the coordinator, which mocks Bitrefill's
    // invoice API (see coordinator/server.js). Returns a payment address
    // and the crypto amount a real wallet would need to send there.
    const createResponse = await fetch(`${COORDINATOR_URL}/api/atlus/create-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountFiat: Number(amount), currency: "USD" }),
    });
    if (!createResponse.ok) {
      throw new Error(`Coordinator create-payment failed (${createResponse.status})`);
    }
    const { invoiceId } = await createResponse.json();

    // Real flow: the user's wallet sends the quoted crypto amount to the
    // invoice's payment address, and the coordinator waits for that to
    // settle before releasing the card. Nothing moves real crypto yet, so
    // this jumps straight to completion instead of prompting a wallet.
    const completeResponse = await fetch(`${COORDINATOR_URL}/api/atlus/complete-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    if (!completeResponse.ok) {
      throw new Error(`Coordinator complete-payment failed (${completeResponse.status})`);
    }
    const { cardNumber, expiry, cvv } = await completeResponse.json();

    // Hand the card details to the checkout tab that started this.
    await chrome.tabs.sendMessage(paymentState.tabId, {
      action: "fillCard",
      cardNumber,
      expiry,
      cvv,
    });

    notifyPopup({ action: "paymentSucceeded" });

    // Fire-and-forget: records the transaction and, if this wallet has a
    // known email, sends a confirmation. The payment already succeeded
    // from the user's point of view (the card is filled), so a failure
    // here is logged but never surfaced as a payment failure.
    notifyWebsiteOfTransaction({
      walletAddress: walletAddress ?? null,
      amount,
      merchant: paymentState.merchant,
      cardLast4: cardNumber.slice(-4),
    });
  } catch (error) {
    notifyPopup({ action: "paymentFailed", message: error.message });
  } finally {
    paymentState = null;
  }
}

function notifyWebsiteOfTransaction(details) {
  fetch(`${WEBSITE_URL}/api/transactions/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  }).catch((error) => {
    console.warn("Atlus Pay: failed to record transaction / send confirmation email", error);
  });
}

function handleCancelPayment() {
  paymentState = null;
  closePopup();
}

function notifyPopup(message) {
  // The popup window may already be gone (user closed it manually),
  // so sendMessage rejects in that case, which is fine to swallow.
  chrome.runtime.sendMessage(message).catch(() => {});
}

function closePopup() {
  if (popupWindowId !== null) {
    chrome.windows.remove(popupWindowId).catch(() => {});
    popupWindowId = null;
  }
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});
