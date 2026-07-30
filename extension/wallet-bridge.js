// wallet-bridge.js - bridges the connected wallet from the Atlus Pay
// website into the extension.
//
// Only runs on the Atlus Pay site itself (see manifest.json's
// content_scripts "matches" - currently http://localhost:3000/* for local
// dev; update that to the production domain once one exists). It never
// runs on merchant checkout pages, which use content.js instead.
//
// The website posts a message to `window` whenever the wallet connects or
// disconnects (see web/components/OnboardingCard.tsx); this script relays
// that into the background service worker, which persists it in
// chrome.storage.local. The payment flow itself connects its own wallet
// session fresh each time (see content.js/injected.js), since Bitrefill
// needs a live signer to actually pay, this stored address is the
// website's own onboarding record, not something the payment flow reads.

window.addEventListener("message", (event) => {
  // Only trust same-window, same-origin messages carrying our own marker.
  // window.postMessage is otherwise readable by anything injected on the
  // page, including other extensions or a compromised third-party script.
  if (event.source !== window) return;
  if (event.data?.source !== "atlus-pay-website") return;

  if (event.data.type === "WALLET_CONNECTED" && event.data.address) {
    chrome.runtime.sendMessage({
      action: "walletConnected",
      address: event.data.address,
    });
  } else if (event.data.type === "WALLET_DISCONNECTED") {
    chrome.runtime.sendMessage({ action: "walletDisconnected" });
  }
});
