# Atlus Pay desktop

A standalone Electron app: a purpose-built shopping window with crypto checkout built in. This is not a browser extension, and that's the point.

## Why this exists instead of (or alongside) the browser extension

The extension works, but it's distributed through Chrome Web Store / Edge Add-ons, and extensions that inject on every page (`<all_urls>`) and interact with crypto wallets get the harshest review scrutiny of any extension category, with real risk of rejection, delay, or removal for reasons outside this project's control.

This app sidesteps that entirely: it's a real desktop application distributed as a direct installer from Atlus's own site, no extension store, no third-party content policy to satisfy beyond standard OS code-signing. The user opens the Atlus app instead of a browser tab, shops and checks out inside its own embedded browsing window, and Atlus's own code has unrestricted control over every page loaded there, since there's no extension sandbox or store review process governing what it's allowed to do.

## Architecture

| Piece | Role |
|---|---|
| `main.js` | Electron main process. Creates the window, lays out the shell + BrowserView, hosts WalletConnect's SignClient, handles all IPC. |
| `shell/` | The address bar strip at the top of the window (not part of the embedded browsing content), plus the settings window. `index.html`/`shell.js` are the address bar UI, `shell-preload.js` is its narrow, navigation-only IPC bridge. `settings.html`/`settings-ui.js`/`settings-preload.js` are the settings window, opened by the gear button. |
| `inject/checkout.js` | The preload script attached to the BrowserView showing whatever site the user is on. Runs on every page navigated to, same job `extension/content.js` does: detect a checkout form, inject the button, run the merchant compatibility check, drive the full-page overlay, fill the card and billing address. Ported directly from the extension version. |
| `walletconnect.js` | Lazily creates and caches the WalletConnect SignClient. Runs only in the main process. |
| `settings.js` | Reads/writes the user's cardholder name, billing address, and merchant blocklist to a JSON file in Electron's `userData` directory. No field ships with a pre-filled value, see the settings section below for why. |

## Two real Electron bugs fixed here, worth knowing if the BrowserView ever renders broken again

1. **Electron sandboxes preload scripts by default** (since Electron v20). A sandboxed preload's `require()` is restricted to a small built-in whitelist and cannot load an installed npm package, `checkout.js`'s `require("qrcode")` included. This failed *silently* (`Unable to load preload script... module not found: qrcode`), meaning the entire preload - checkout detection and all - never ran, and the page underneath rendered black/unstyled as a side effect. Fixed with `sandbox: false` on the `BrowserView`'s `webPreferences`. `nodeIntegration` stays `false`, so only the trusted preload script gets Node access, not the arbitrary page content running alongside it.
2. **`document.documentElement` can be `null` when a preload script's top-level code runs**, unlike a Chrome extension content script, which Chrome only ever runs once a DOM exists. `checkout.js`'s top-level `MutationObserver(...).observe(document.documentElement, ...)` threw on pages where this raced ahead of parsing, aborting the whole script. Fixed by deferring to `DOMContentLoaded` when `document.readyState === "loading"`.

Full diagnosis trail in [RESEARCH.md](../RESEARCH.md#2026-07-31---desktop-app-two-real-electron-bugs-and-a-blocked-bitrefill-product).

## Why `checkout.js` doesn't need a separate injected-script bridge

The browser extension needs `injected.js` as a *separate* file because Chrome content scripts run in an isolated JS world that can't reach `window.ethereum` directly. Electron preload scripts don't have that problem: a preload script is already privileged (it can `require()` Node modules) and shares the actual page's DOM in the same context. So `checkout.js` just calls `ipcRenderer.invoke(...)` directly for wallet operations, no `contextBridge` indirection needed, that pattern was specifically working around a Chrome-extension constraint this architecture doesn't have.

## Wallet connection: WalletConnect, not an injected provider

MetaMask and Phantom are themselves browser extensions. They don't exist inside Electron's separate, embedded Chromium instance the way they do in a real installed browser. Instead of trying to bundle a wallet extension into the app, wallet connection uses **WalletConnect**: the overlay shows a QR code, the user scans it with their phone's wallet app (or another WalletConnect-compatible wallet), approves the session there, and every transaction gets signed by tapping approve on their phone.

`@walletconnect/sign-client` runs in the main process only (it's a Node.js-compatible SDK). The session is scoped to exactly one method (`eth_sendTransaction`) and one chain (`eip155:8453`, Base), nothing broader is requested.

**Balance checks bypass the wallet entirely.** A balance is public on-chain data, no signature or wallet permission needed to read it, so `checkout.js` queries Base's official public RPC (`https://mainnet.base.org`) directly with a plain `eth_call`, instead of routing a read through a session that's reserved for the one thing it actually needs to authorize: the real transfer.

## What's identical to the extension version

The checkout form detection (selectors, `MutationObserver` for late-rendering SPA forms), the card-fill logic (native setter + dispatched events), the ERC-20 `transfer`/`balanceOf` calldata encoding, and the overlay's two-step confirmation (amount, then an explicit second click if the card's fixed denomination costs more than the checkout total) are all ported directly, not rebuilt. See `extension/content.js` and `RESEARCH.md` for the reasoning behind each of those, it still applies here unchanged.

## Merchant compatibility check

Before any wallet is connected, `checkMerchantCompatibility()` in `checkout.js` runs two checks: whether the current domain is on the user's own merchant blocklist (set in the settings window, empty by default), and whether the checkout form has a billing-country field that doesn't even list the United States. If either fails, the overlay shows the reason and removes the Confirm button, no wallet connection is attempted at all, so nothing gets a chance to spend crypto.

This is a **best-effort** check, not a guarantee. There's no reliable way to know from the DOM alone whether a specific payment gateway's BIN-range region lock will actually accept a given prepaid card, that can only be known by attempting the charge. Nothing is hardcoded into a "known incompatible merchants" list here either, since no such list has been independently verified yet, only what a user adds to their own blocklist after a real observed rejection.

## Settings: cardholder name and billing address

Opened via the gear button in the address bar. Fills whatever name/address fields a checkout form has, right after the card number/expiry/CVV, using whatever the user has entered in settings. Every field starts empty, on purpose: this needs to be the cardholder's own real information (matching whoever the Bitrefill card gets issued to) for a merchant's address-verification check to make sense, so there's no built-in default address of any kind here to fill that in for them.

## Open question: the USA variable-amount Visa card is currently blocked, not built

The plan to move off fixed-denomination cards (see `coordinator/server.js`) onto Bitrefill's real variable-amount **Digital Prepaid Visa (USA)** product was checked against the live API before writing any code for it. The product itself is real (any dollar amount, $1,000/week cap, asks for a cardholder name, confirmed against Bitrefill's own product page). But `GET /v2/products/virtual-prepaid-visa-usa` returns `403 not_available` for this account specifically, while the already-working AU product and two other countries' general-purpose cards both return `200` on the same API key, isolating this to an account-level restriction on the USA product, not a network issue. Full findings in [RESEARCH.md](../RESEARCH.md#2026-07-31---desktop-app-two-real-electron-bugs-and-a-blocked-bitrefill-product), including why the "use a VPN/proxy for a US IP" idea from the incoming spec wasn't built: it wouldn't fix an account-level 403, and Bitrefill's own terms treat circumventing geoblocking as grounds for account suspension. The coordinator still runs on the fixed-package AU product until there's a real path to the USA product.

## Run it

```
cd desktop
npm install
npm start
```

Needs the coordinator (`coordinator/`) and the website (`web/`) running for the payment and email-confirmation steps to work, same as the extension.

## Real-money warning

Same as the extension: this sends real USDC on Base to a real Bitrefill invoice. There is no sandbox. Your wallet app's own confirmation screen before signing is the last, real safety check.
