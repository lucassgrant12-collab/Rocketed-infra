// background.js - Atlus Pay service worker
//
// A thin relay between content.js and two servers:
//   - the coordinator (coordinator/server.js), for creating and polling a
//     real Bitrefill payment
//   - the website, for recording a completed transaction and triggering
//     a confirmation email
//
// The actual payment orchestration (wallet connect, sending the
// transaction, filling the card) lives in content.js now, since the
// full-page overlay is part of the checkout page itself. This file just
// does the fetch calls content.js can't make as conveniently from an
// isolated-world content script message handler.
//
// wallet-bridge.js (on the Atlus site only) still reports the connected
// wallet address here, kept for the website's own onboarding/account
// record, separate from whichever wallet actually pays for a given
// transaction.

const COORDINATOR_URL = "http://localhost:3001"; // coordinator/server.js (real Bitrefill)
const WEBSITE_URL = "http://localhost:3000"; // the Next.js site (records transactions, sends emails)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "walletConnected":
      handleWalletConnected(message.address);
      return false;
    case "walletDisconnected":
      chrome.storage.local.remove("walletAddress");
      return false;
    case "createPayment":
      forwardJson(sendResponse, `${COORDINATOR_URL}/api/atlus/create-payment`, {
        amountFiat: message.amountFiat,
      });
      return true; // keep the message channel open for the async sendResponse
    case "pollUntilPaid":
      forwardJson(sendResponse, `${COORDINATOR_URL}/api/atlus/poll-until-paid`, {
        invoiceId: message.invoiceId,
      });
      return true;
    case "recordTransaction":
      forwardJson(sendResponse, `${WEBSITE_URL}/api/transactions/complete`, {
        walletAddress: message.walletAddress ?? null,
        amount: message.amount,
        merchant: message.merchant,
        cardLast4: message.cardLast4,
      });
      return true;
    default:
      return false;
  }
});

async function handleWalletConnected(address) {
  if (!address) return;
  await chrome.storage.local.set({ walletAddress: address });
}

function forwardJson(sendResponse, url, body) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((response) => response.json().catch(() => ({})))
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
}
