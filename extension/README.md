# Atlus Pay extension

Manifest V3 Chrome extension. Injects a "Pay with Atlus" button into any checkout page. Clicking it opens a full-page overlay that connects your wallet, sends a real Ethereum mainnet payment to Bitrefill for a prepaid card, waits for it to be issued, then fills it into the page's own card fields. This moves real money, see [Real-money warning](#real-money-warning) below before testing.

## Files

| File | Role |
|---|---|
| `manifest.json` | Permissions, content script registration, service worker entry point |
| `background.js` | Service worker, relays coordinator/website fetch calls for content.js |
| `content.js` | Runs on every page: detects the checkout form, injects the button, builds and drives the full-page overlay, fills the form |
| `injected.js` | Runs in the page's own JS world (injected by content.js), the only place `window.ethereum` is reliably reachable |
| `wallet-bridge.js` | Runs only on the Atlus Pay website, relays the connected wallet address into the extension for the website's own onboarding record |
| `test/checkout.html` | Dummy checkout page for manual testing |

## Why a page-injected script for the wallet

Content scripts run in an isolated JS world: they share the DOM with the page, but not arbitrary window properties like `window.ethereum`, MetaMask injects that into the page's own world. `injected.js` is a real `<script>` tag content.js adds to the page, so it runs in that world and can actually reach `window.ethereum`. It talks back to content.js over `window.postMessage`, the same pattern `wallet-bridge.js` already uses to talk to the website.

`ethers.js` is deliberately not bundled here. Sending real money only needs a handful of EIP-1193 calls (`eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`, `eth_getBalance`, `eth_sendTransaction`) plus one small BigInt-based decimal-to-wei conversion in `content.js`. For code that moves real funds, a few directly readable lines felt more trustworthy than vendoring a large third-party minified bundle.

## Real-money warning

The payment step sends real ETH on Ethereum mainnet to a real Bitrefill invoice address, and purchases a real prepaid card. There is no free way to test this end to end: Bitrefill has no sandbox environment and no testnet payment method (see [../coordinator/README.md](../coordinator/README.md) for what was actually verified against their real API before this was built). MetaMask's own confirmation screen is the last safety check, always read the exact amount there before approving.

The coordinator enforces `MAX_SPEND_USD` (default $20) as a hard cap on top of that, but that's a limit, not a substitute for paying attention.

## Load it in developer mode

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Atlus Pay should appear in the extensions list (pin it if you like, not required, the button injected on checkout pages is the actual entry point, not the toolbar icon).

## Set up the coordinator first

See [../coordinator/README.md](../coordinator/README.md) for getting a real Bitrefill API key and looking up the real product_id. Nothing here works without both set in `coordinator/.env`.

```
cd coordinator
npm install
npm start
```

## Test against the dummy checkout page

1. With the coordinator running on `http://localhost:3001` and a MetaMask wallet holding a small amount of real mainnet ETH, serve `test/checkout.html` over HTTP, not `file://` (Chrome doesn't run content scripts on `file://` pages without an extra permission). Any static server works, e.g. from the `extension/` folder: `npx serve test`.
2. Open the served URL. A "Pay with Atlus" button should appear directly above the card number field.
3. Click it. A full-page overlay appears showing the detected total, connects your wallet (MetaMask will prompt), switches to Ethereum mainnet if needed, and shows your ETH balance.
4. Click **Confirm Payment**. MetaMask prompts you to sign a real transaction, read the amount carefully. The overlay then shows "Waiting for confirmation," then "Waiting for the card," and finally fills the card fields once Bitrefill issues it.
5. The overlay never displays the card number itself, only progress text. It fades out a couple seconds after success. The merchant's own card fields are left filled in, but the extension does not submit the form for you.
6. To test the "amount not detected" path, remove or rename the `id="total"` / `class="order-total"` element in `checkout.html` before reloading, the button won't find a total and will show an alert instead of opening the overlay.

## What can be verified without spending money

The overlay's UI states, error handling, and the wallet-connection flow can all be exercised with a mocked `window.ethereum` provider (the same technique used earlier in this project to test wallet connect), without ever reaching the real send-transaction step. Only the actual `eth_sendTransaction` call and everything after it require real funds.

## Wallet sync

`wallet-bridge.js` only runs on `http://localhost:3000/*` (the Atlus Pay website itself, update this match pattern once there's a production domain). It stores the website's connected wallet address in `chrome.storage.local` for the website's own onboarding record. The payment flow does not read it: it connects its own live wallet session through `injected.js` each time, since Bitrefill needs an active signer to actually pay, not a cached address.
