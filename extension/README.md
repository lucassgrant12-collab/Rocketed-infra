# Atlus Pay extension

Manifest V3 Chrome extension. Injects a "Pay with Atlus" button into any checkout page, coordinates a mock atomic card purchase with a coordinator server, and fills the resulting virtual card into the page's own form fields.

## Files

| File | Role |
|---|---|
| `manifest.json` | Permissions, content script registration, service worker entry point |
| `background.js` | Service worker — message hub, talks to the coordinator, relays card details |
| `content.js` | Runs on every page — detects the checkout form, injects the button, fills the form |
| `popup.html` / `popup.js` | Standalone confirm/cancel window opened per payment (not the toolbar popup) |
| `wallet-bridge.js` | Runs only on the Atlus Pay website — relays the connected wallet address into the extension |
| `test/checkout.html` | Dummy checkout page for manual testing |

## Load it in developer mode

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Atlus Pay should appear in the extensions list and in the toolbar overflow menu (pin it for easy access — not required, the button injected on checkout pages is the main entry point, not the toolbar icon).

## Test against the dummy checkout page

The coordinator this extension talks to (`http://localhost:3000/api/pay`, `/api/reveal`) isn't part of this folder — bring your own, or point `COORDINATOR_URL` in `background.js` at wherever it's running.

1. Start whatever coordinator is running on `http://localhost:3000` (or update `COORDINATOR_URL` in `background.js` to match).
2. Serve `test/checkout.html` over HTTP — not `file://`, since Chrome doesn't run content scripts on `file://` pages without an explicit extra permission. Any static server works, e.g. from the `extension/` folder: `npx serve test`.
3. Open the served URL. A "Pay with Atlus" button should appear directly above the card number field.
4. Click it — a small popup window opens showing the detected total ($49.99, pulled from the page's `.order-total`).
5. Click **Confirm**. The popup shows "Processing...", the service worker calls `/api/pay` then `/api/reveal`, and on success the popup closes itself and the checkout page's card number / expiry / CVV fields fill in automatically.
6. To test the "amount not detected" path, remove or rename the `id="total"` / `class="order-total"` element in `checkout.html` before reloading — the popup should show a manual amount input instead.

## Wallet sync

`wallet-bridge.js` only runs on `http://localhost:3000/*` (the Atlus Pay website itself — update this match pattern once there's a production domain). When the website connects a wallet, it posts a `window.postMessage` that this script relays to the service worker, which stores the address in `chrome.storage.local`. The stored address (if any) rides along on the `/api/pay` call as `walletAddress` — it's informational for the coordinator, not required for the mock flow to work.
