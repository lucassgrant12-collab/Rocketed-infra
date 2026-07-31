# Atlus Pay desktop

A standalone Electron app: a purpose-built shopping window with crypto checkout built in. This is not a browser extension, and that's the point.

## Why this exists instead of (or alongside) the browser extension

The extension works, but it's distributed through Chrome Web Store / Edge Add-ons, and extensions that inject on every page (`<all_urls>`) and interact with crypto wallets get the harshest review scrutiny of any extension category, with real risk of rejection, delay, or removal for reasons outside this project's control.

This app sidesteps that entirely: it's a real desktop application distributed as a direct installer from Atlus's own site, no extension store, no third-party content policy to satisfy beyond standard OS code-signing. The user opens the Atlus app instead of a browser tab, shops and checks out inside its own embedded browsing window, and Atlus's own code has unrestricted control over every page loaded there, since there's no extension sandbox or store review process governing what it's allowed to do.

## Architecture

| Piece | Role |
|---|---|
| `main.js` | Electron main process. Creates the window, lays out the shell + BrowserView, hosts WalletConnect's SignClient, handles all IPC. |
| `home/` | Atlus's own start screen, `index.html`/`home.js`. A searchable grid of the retailer catalog (fetched from the coordinator's `GET /api/atlus/retailers`), not a general browser start page, see below. |
| `shell/` | The top strip at the top of the window (not part of the embedded browsing content), plus the settings window. `index.html`/`shell.js` are back/forward/reload/home controls, `shell-preload.js` is its narrow IPC bridge. `settings.html`/`settings-ui.js`/`settings-preload.js` are the settings window, opened by the gear button. |
| `inject/checkout.js` | The preload script attached to the BrowserView showing whatever site the user is on. Runs on every page navigated to, same job `extension/content.js` does: detect a checkout form, match the current domain against the retailer catalog, run the merchant compatibility check, drive the full-page overlay, fill the resulting code/card and billing address. |
| `walletconnect.js` | Lazily creates and caches the WalletConnect SignClient. Runs only in the main process. |
| `settings.js` | Reads/writes the user's cardholder name, billing address, and merchant blocklist to a JSON file in Electron's `userData` directory. No field ships with a pre-filled value, see the settings section below for why. |

## Not a general browser, on purpose

There's no address bar and no free-text search. The window opens on Atlus's own home screen (`home/index.html`), a big searchable grid of retailers Atlus actually has a real, verified product for (see `coordinator/retailers.js`). Clicking one is a plain link, no special navigation logic, it just opens that retailer's real site in the BrowserView the same way any link click would. The top strip keeps back/forward/reload (useful once you're browsing a retailer's own site) and a Home button back to the grid, nothing else. This is a deliberate scope narrowing: Atlus only claims to work on sites it's actually checked, not "any checkout," which is a claim that turned out not to hold up under the Visa-card model (see below).

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

## What's still shared with the extension version

The ERC-20 `transfer`/`balanceOf` calldata encoding and the overlay's two-step confirmation (amount, then an explicit second click if the card costs more than the checkout total) are unchanged. See `extension/content.js` and `RESEARCH.md` for the reasoning, it still applies here.

## The payment priority chain

Clicking "Pay with Atlus" runs through a fixed order, checked before any wallet is ever connected, so nothing past the first blocking step gets a chance to spend crypto:

1. **Does this site already accept crypto directly?** `detectDirectCryptoAcceptance()` scans script/iframe src and link hrefs for known crypto-gateway domains (Coinbase Commerce, BitPay, OpenNode, etc). If so, buying an Atlus gift card would be strictly worse for the user (extra step, possible rounding waste) than the merchant's own crypto checkout, so Atlus tells the user that and stops.
2. **Does `coordinator/retailers.js` have a real, verified product for this exact domain?** Checked via `GET /api/atlus/match`, an exact domain match only, no fuzzy matching, ever.
3. **Neither** - Atlus says so plainly and doesn't attempt a payment.

## Gift-card fields, not just credit-card fields

Most retailers in the catalog issue their own store gift card once Atlus pays for it, not a Visa-network card. That redeems through a "gift card / promo code" field, not the `cc-number`/`cc-exp`/`cc-csc` fields a payment card uses, and there's no HTML `autocomplete` token for gift-card fields the way there is for credit cards, so `findRedemptionTarget()` in `checkout.js` checks gift-card-shaped selectors first, credit-card selectors second (kept for a future card-network product, if one's ever added back). Detection here is expected to miss sometimes, that's why the overlay always shows the raw redemption text as a copy-paste fallback (see `coordinator/server.js`'s `parseRedemption()`), not just whatever got auto-filled.

## Merchant compatibility check

Runs after a retailer match is found, before any wallet is connected. `checkMerchantCompatibility()` always checks the user's own merchant blocklist (set in the settings window, empty by default). It only checks for a billing-country field missing the United States when the redemption target is a Visa-shaped card, that heuristic doesn't apply to a store gift card, which has no AVS check.

This is a **best-effort** check, not a guarantee. There's no reliable way to know from the DOM alone whether a specific payment gateway will actually accept a given card, that can only be known by attempting the charge.

## Settings: cardholder name and billing address

Opened via the gear button in the top strip. Only relevant for a Visa-shaped redemption target, fills whatever name/address fields a checkout form has using whatever the user has entered in settings. Every field starts empty, on purpose: this needs to be the cardholder's own real information for a merchant's address-verification check to make sense, so there's no built-in default address of any kind.

## The card system changed again: merchant gift cards, not a universal Visa

The plan to move off fixed-denomination cards onto Bitrefill's real variable-amount **Digital Prepaid Visa (USA)** product was checked against the live API. It's real, but `GET /v2/products/virtual-prepaid-visa-usa` returns `403 not_available` for this account, tied to account country not IP (confirmed: `physical-prepaid-visa-usa` returns `"not available in your country (AU)"` explicitly). Separately, the already-configured AU Visa card turned out to require app-based activation with an Australian mobile number and wallet-tokenization, no plain card number at all, so it was never actually going to work either.

The replacement, built here: buy the checking-out merchant's **own** gift card instead of a universal card. A wider survey of 77 everyday retailers found most (65%, higher in the US at 82%) support an exact custom amount, so the fixed-denomination overpay problem mostly disappears too. Full findings, including the Bitrefill account-block investigation and the survey methodology, in [RESEARCH.md](../RESEARCH.md#2026-07-31---the-card-system-changes-again-merchant-gift-cards-not-a-universal-visa).

## Run it

```
cd desktop
npm install
npm start
```

Needs the coordinator (`coordinator/`) and the website (`web/`) running for the payment and email-confirmation steps to work, same as the extension.

## Real-money warning

Same as the extension: this sends real USDC on Base to a real Bitrefill invoice. There is no sandbox. Your wallet app's own confirmation screen before signing is the last, real safety check.
