# Research Notes

Deeper research thinking, tradeoffs, prior art, and open questions behind Atlus Pay. This file is for *why* - the reasoning, comparisons, and things still unresolved. Chronological engineering steps go in [BUILD_LOG.md](BUILD_LOG.md); presentation-ready material goes in [SLIDES.md](SLIDES.md).

---

## 2026-07-29 - System debrief: Atlus Pay

### The problem

There's no universal "connect wallet and pay anywhere" button. Existing crypto payment solutions are custodial, require KYC, or demand the merchant accept crypto directly. A user who's made gains in a volatile coin has to manually cash out, pay tax, and wait days before they can spend it. Atlus Pay is a non-custodial payment layer that works on any checkout, for any crypto, without the user or Atlus ever touching fiat directly.

### System overview - three components

| Component | Role |
|---|---|
| **User Vault** | Non-custodial smart-contract wallet (or connected EOA) the user controls, secured by guardian recovery via Shamir secret sharing |
| **Payer Node Network** | Liquidity providers who stake capital and use their own fiat rails (virtual Visa cards, bank APIs) to pay merchants on the user's behalf. Earn fees for fronting fiat. |
| **Atlus Protocol Core** | Off-chain coordination (relayer, double-entry ledger) + on-chain escrow contracts that atomically hold stablecoins until proof of fiat payment is provided. Atlus itself never holds funds. |

### Payment flow, end to end

0. **Onboarding** (simplified, per 2026-07-29 decision): user enters a username, then connects their wallet. No separate KYC/identity step at this stage.
1. **Checkout integration** - merchant site embeds the Atlus Pay JS snippet, rendering a "Pay with Atlus" button carrying amount, currency, and order ID.
2. **Auth & authorization** - user clicks the button, sees a popup with the exact fiat amount and merchant (Apple-Pay-style), authenticates via biometric/passkey. Atlus pulls a live price oracle quote and the best DEX swap route from the user's chosen crypto to a stablecoin.
3. **Atomic swap & escrow lock** - the vault signs one batched meta-transaction: approve crypto → swap via DEX aggregator into USDC → deposit USDC into a dedicated escrow contract. Submitted by an Atlus relayer, so the user needs no gas tokens. Escrow release condition: proof of a fiat payment of the exact amount to the merchant.
4. **Payer Node fronts the fiat** - a Payer Node sees the USDC land in escrow and instantly issues a one-time virtual Visa card for the exact fiat amount via its own card-issuing API (Stripe Issuing / Marqeta). The Atlus snippet injects the card number into the merchant's checkout form; the merchant charges it and settles normally. Target: authorization under 2 seconds.
5. **Proof of payment & escrow release** - the Payer Node captures the merchant's payment confirmation (webhook, receipt, or card transaction ID) and submits it to the escrow contract. The escrow verifies the proof (trusted oracle or ZK validity proof) and releases the USDC to the Payer Node.
6. **Ledger finalization** - Atlus's off-chain double-entry ledger updates the user's balance and marks the obligation settled. User gets an **email confirmation**: "Payment of $100 to Example Store confirmed." (Per 2026-07-29 decision - original debrief specified a push notification; email is the actual v1 channel.)

### Key design properties

- **Non-custodial** - Atlus never possesses user crypto or fiat. Escrow is code-controlled; Payer Nodes front their own fiat, not user funds.
- **Volatility protection** - the instant swap at authorization means the payer only ever receives stablecoins; the user, not Atlus or the Payer Node, eats crypto market risk up to the point of swap.
- **Privacy** - user wallet addresses are never revealed to merchants or Payer Nodes. Shipping/personal details are filled directly into the merchant form client-side, bypassing Atlus servers. Blind signatures can further decouple payment authorization from identity.
- **No money transmission (claimed)** - Atlus coordinates a peer-to-peer escrow rather than transmitting, holding, or converting user funds itself. The fiat leg is handled by independent Payer Nodes, each responsible for their own regulatory compliance. (See Risks section - this needs real legal review, not just architectural self-assessment.)
- **Frictionless UX** - biometric confirmation, gasless meta-transactions, no manual swaps or on-chain waits. User experience is "tap to pay," confirmation follows by email.

### Existing tech stack (per user, already built elsewhere - not yet present in this repo)

- Double-entry ledger for off-chain balance tracking and reconciliation.
- Non-custodial vault with Shamir secret-sharing guardian recovery.
- RSA blind signature module for privacy-preserving authorization tokens.
- Adapter pattern for plugging in various Payer Node fiat rails (Stripe Issuing, Marqeta, etc.).

*Open item: confirm where this existing code lives and whether/how it gets pulled into this repo as implementation starts.*

---

## Escrow proof-of-payment mechanism - deeper design

This is the trust-critical piece of the whole system: whoever decides "the merchant got paid" controls whether a Payer Node can drain escrow without actually paying anyone.

**Naive version:** Payer Node self-reports via API call that it paid the merchant. Centralization risk - nothing stops a Payer Node from claiming a payment happened when it didn't, or overcharging.

**Trusted-oracle version:** the card issuer (Stripe Issuing / Marqeta) sends a webhook confirming the specific card transaction settled for the exact merchant and amount. An oracle (e.g. Chainlink Functions, or a custom relayer) attests to that off-chain event on-chain. Single point of trust moves from the Payer Node to the issuer + oracle.

**Multi-source cross-check:** avoid a single oracle by having several independent attestors pull from card-network data (authorization + settlement) and require consensus - same shape as a bonded-watcher network, just for card settlement events instead of on-chain exploits.

**ZK version:** the card issuer's API response could be wrapped in a TLSNotary-style proof, proving an HTTPS response occurred without needing the issuer to build special integration for Atlus. Removes the "trusted oracle operator" as a point of failure - the proof is verifiable from the raw TLS session.

**Important nuance not resolved in the original debrief: authorization vs. settlement.** Card network authorization is near-instant (matches the "<2 second" target), but *settlement* - the point at which the merchant actually receives funds and a chargeback becomes unlikely - typically takes 1-3 days. "Proof of payment" needs to specify which of these it means:
- If escrow releases on **authorization** proof, the Payer Node gets paid in USDC before settlement risk (chargebacks, holds) has cleared - Payer Node effectively takes on settlement risk in exchange for the fee.
- If escrow releases on **settlement** proof, the Payer Node fronts fiat and waits days for their USDC, which changes the capital efficiency and fee economics substantially.

This should be decided explicitly, not left implicit - it's the difference between "Payer Nodes get paid fast and take settlement risk" and "Payer Nodes get paid slow and are protected from it."

**Dispute window:** regardless of which proof point is chosen, a short window before final release lets the user or merchant contest a claim before funds move - mirrors the bonded-watcher dispute pattern rather than being an idea unique to this system.

---

## Monetization / fee model

- **Payer Node fee** - the primary user-facing cost: a spread/fee for instantly fronting fiat, analogous to a card processing fee or FX spread. Likely 1-3%, probably scaled by asset volatility and route liquidity.
- **Atlus Protocol fee** - a cut of the Payer Node fee, or a flat per-transaction fee, for coordination services (relayer/gas sponsorship, ledger, matching, escrow infrastructure).
- **DEX/swap costs** - standard aggregator fees + slippage, paid by the user as part of the swap; not Atlus revenue.
- **Payer Node staking** - nodes post a capital bond to participate (skin in the game against disappearing mid-flow or double-spending fiat rails). Not direct Atlus revenue, but core to why the "trust a Payer Node's self-report" risk above is tolerable at all.
- **Possible secondary revenue** - merchant-side analytics/premium integration tiers, or a faster-settlement guarantee tier, once volume exists to justify it. Speculative - not needed for v1.

*Open item: no numbers have been decided yet. This section is a shape for the model, not a set fee schedule.*

---

## Risks & regulatory analysis

Not legal advice - this is a design-level risk map, flagging where a real deployment needs actual legal review before real funds move through it, not a substitute for that review.

- **Money transmission** - Atlus itself likely avoids money-transmitter licensing because it never custodies funds. Payer Nodes, who front fiat and receive crypto, may individually trigger MTL/MSB registration requirements depending on jurisdiction - "each Payer Node handles its own compliance" is an architectural choice, not a guarantee that compliance is simple or automatic for them.
- **Card issuer / network risk** - one-time virtual cards issued instantly for high-value, single-use transactions can resemble card-testing or fraud patterns to issuer risk models. Payer Nodes need issuer relationships that explicitly tolerate this usage pattern, or authorizations will get declined in practice.
- **Escrow oracle risk** - if the proof-of-payment oracle is compromised, or a Payer Node colludes with it, USDC could be released without the merchant ever being paid. This is the single biggest technical risk in the system and ties directly to the escrow mechanism section above - the choice between self-report / trusted oracle / multi-source / ZK proof is a risk decision, not just an implementation detail.
- **Payer Node insolvency / failed settlement** - if a Payer Node fronts a card payment and the merchant charge fails, gets disputed, or the proof step breaks, the node is out real fiat with no immediate on-chain recourse. Staking/bonding mitigates this but slashing conditions aren't yet defined.
- **KYC / sanctions exposure** - Atlus being non-custodial doesn't remove KYC obligations from the system overall; it shifts them onto whichever Payer Node touches the traditional financial rails. Whether Payer Nodes need to KYC users, and how that squares with the stated privacy goals, is unresolved.
- **Privacy vs. compliance tension** - "wallet address never revealed to merchant or Payer Node" plus blind-signature authorization is in direct tension with a Payer Node's own transaction-monitoring/travel-rule obligations in most jurisdictions. Worth naming explicitly as a tradeoff in the writeup rather than presenting privacy as a free win.

---

## Prior art / comparisons worth drawing on

- **Apple Pay / Google Pay** - the UX bar Atlus Pay is explicitly targeting ("as easy as Apple Pay"); worth comparing the tokenization model (device-bound token instead of card number) to Atlus's one-time virtual card approach.
- **Stripe Issuing / Marqeta** - the actual card-issuing rails Payer Nodes would sit on top of.
- **HTLCs / atomic swaps** - the escrow-lock-until-proof pattern is structurally similar to a hashed timelock contract; worth citing as the closest well-known primitive even though the "proof" here is off-chain fiat settlement rather than a hash preimage.
- **TLSNotary / zkTLS proofs** - relevant prior art for the ZK version of the proof-of-payment mechanism.
- **Chaum blind signatures** - the actual cryptographic primitive behind "blind signatures decouple authorization from identity"; useful to cite by name in the deeper explanation slide.

---

## 2026-07-29 - Pivot: Atlus Treasury Model (v1)

### What changed

The independent Payer Node network moves from "v1 requirement" to "v2/future scaling step." For v1, **Atlus itself is the sole payer node**: it converts the user's crypto to a stablecoin, takes a fee, and pays the merchant directly from its own fiat balance via a virtual card API. Fiat rails are simulated through the Stripe Issuing sandbox during development - no real money moves yet. This is a development-stage choice, not the ceiling: Atlus Pay is a real project intended to eventually move real funds. (It also happens to double as the project owner's Year 11 AIF submission - that's incidental to the build, not the reason for it.)

### Updated flow (v1, Treasury Model)

1. **Checkout integration** - merchant embeds the Atlus Pay JS snippet; the button sends payment amount and order ID.
2. **User authentication** - popup shows the exact amount; user authenticates with biometrics/passkey. No manual wallet interaction at payment time (wallet connection itself happens once, at onboarding).
3. **Crypto conversion & collection** - user's crypto (e.g. BTC) is auto-swapped to USDT via an integrated DEX aggregator. The exact amount (purchase + fee - e.g. $103.50 for a $100 item at 3.5%) is converted and sent to **Atlus's own wallet** in a single meta-transaction, so the user needs no gas tokens.
4. **Fiat payment execution** - Atlus's server detects the incoming USDT and immediately generates a one-time virtual Visa card (Stripe Issuing sandbox) for the exact fiat amount. The card is injected into the merchant's checkout form and submitted; the merchant charges it and settles normally. Target: under 2 seconds.
5. **Confirmation & profit** - Atlus verifies the merchant payment succeeded, marks the order paid, and retains the USDT. The fee (e.g. $3.50) is Atlus's profit. Atlus off-ramps the USDT to fiat later, at its own convenience, to replenish the fiat float.
6. **Privacy protection** - shipping/billing details are filled directly into the merchant's form by the user's browser and never touch Atlus's servers. Atlus only sees the payment amount and a pseudonymous wallet address.

### Business / scaling strategy

- **v1:** Atlus is the sole payer node, using its own fiat capital (or a small test float for the project). All fees go to Atlus.
- **v2 (future):** opens to third-party Payer Nodes who stake capital and compete to process payments for a spread; Atlus takes a smaller protocol fee per transaction instead of the full spread. This is the point where the original "Payer Node Network" design (Slide 2 in SLIDES.md) goes from aspirational to live.

### Tension to flag: this changes the non-custodial claim for v1

The original pitch was "Atlus never touches funds - escrow releases directly to independent Payer Nodes." Under the Treasury Model, Atlus's own wallet is the one collecting and holding user-originated USDT (until it off-ramps, on its own schedule) - that *is* custody of converted funds, even briefly. This doesn't break the non-custodial framing for the **User Vault** (the user still holds their own crypto until the moment of payment and explicitly authorizes the conversion), but it does mean the **protocol** is custodial of the stablecoin leg for v1, unlike the original "Payer Node fronts its own capital" model. Worth being precise in the writeup/slides: "non-custodial wallet" and "non-custodial protocol" are different claims, and v1 only supports the first.

---

## 2026-07-29 - Pivot: checkout moves from a merchant JS snippet to a browser extension

### What changed

Step 1 of the original flow ("merchant site embeds the Atlus Pay JS snippet") required **merchant cooperation** - every store had to integrate before a user could pay with Atlus there. That's the same adoption bottleneck every "accept crypto" plugin has always hit: you need merchants to sign up before users can use it, and users won't show up until merchants have.

The new model removes that requirement entirely. **Atlus Pay ships as a Chrome extension the user installs.** The extension itself detects the checkout form on whatever page the user is already on (matching common `cc-number` / `cc-exp` / `cc-csc` autocomplete attributes and name/id patterns) and injects the "Pay with Atlus" button directly - no merchant integration, no snippet, works on any checkout that has a standard card form. This is the same distribution model as Honey, Capital One Shopping, or a password manager's autofill: the leverage point is the user's browser, not the merchant's codebase.

### Updated architecture

- **content.js** - runs on every page, scans for a card-number field, injects the button next to it, and later fills that same field (plus expiry/CVV) once a virtual card comes back. Uses a native-setter + dispatched `input`/`change` event trick to fill fields correctly even on React/Vue-controlled checkout forms that ignore a plain `.value =` assignment.
- **background.js (service worker)** - the new name for the coordination role previously described as "Atlus relayer" / "Atlus Protocol Core." Talks to a **coordinator server** that mirrors the hashlock/HTLC shape already designed in the escrow-proof section above: `POST /api/pay` opens an order and returns a hash + secret, `POST /api/reveal` (after a simulated on-chain-settlement delay) returns the virtual card. This is a genuine simplification of that earlier design for the extension MVP - the mock coordinator hands back the secret directly instead of it being revealed by a real on-chain transaction - but the shape (lock → reveal → card) is the same primitive the real system is meant to use, so this is a legitimate stepping stone, not a divergent design.
- **popup.html/popup.js** - the Apple-Pay-style confirmation popup from the original flow, now literally a `chrome.windows.create` popup window instead of an in-page modal.
- **wallet-bridge.js** - new. A content script scoped only to the Atlus Pay website (not merchant pages) that relays the connected wallet address from the site into the extension via `chrome.storage.local`, so a payment started from the extension can carry a wallet address without asking the user to reconnect inside the extension itself.

### What this doesn't change

The underlying payment mechanics (swap → lock → fiat leg → reveal → settle) and the open questions already logged above (authorization-vs-settlement timing, who verifies the proof, the v1 custodial tension) are unaffected - this pivot is about **how the button gets in front of the user**, not about who holds funds or how proof-of-payment works. Those still need to be wired into the real coordinator when it moves past the mock `/api/pay` / `/api/reveal` stand-in.

---

## 2026-07-29 - Pivot: Bitrefill replaces Stripe Issuing as the card-issuing plan

Earlier entries in this file describe Stripe Issuing (or Marqeta, mentioned as an alternative in the original debrief) as the card-issuing rail. That's dropped. **Bitrefill**, the large existing crypto prepaid card vendor, is the new plan instead of building or getting approved for a bespoke card-issuing integration from scratch.

### Why this is a meaningfully different shape, not just a vendor swap

Stripe Issuing means Atlus itself becomes the card program: applying for Issuing access, holding the issuing relationship, taking on the compliance surface that comes with actually minting cards. Bitrefill already does the crypto-to-prepaid-card conversion as its core product, at consumer scale, today. Routing through Bitrefill instead means Atlus is a client of an existing card-issuing business, not the card issuer itself. That's a smaller regulatory footprint for the card-issuing leg specifically (the KYC/AML and issuing-license questions become Bitrefill's problem, not Atlus's), at the cost of depending on a third party's API, pricing, and rate limits instead of controlling the whole stack.

### The mechanical flow, as designed for the mock and the eventual real integration

1. Atlus's coordinator opens an invoice with Bitrefill for the fiat card value the user wants (e.g. a $100 card), specifying the crypto currency to pay in (USDT). Bitrefill returns a payment address and the crypto amount owed, priced with Bitrefill's own fee built in (the mock uses a flat 5% markup as a stand-in for whatever Bitrefill's real rate turns out to be).
2. The user's wallet would send that crypto amount directly to Bitrefill's payment address. Not through an Atlus-held address, not through Atlus at all: this preserves the non-custodial claim from the very first entry in this file, since Atlus never touches the funds even momentarily.
3. Once that payment settles, Bitrefill's invoice status flips to paid and the card details become available.
4. Atlus's coordinator (polling or, better, via a webhook once that's supported) retrieves the card and hands it to the extension to fill into the checkout form.

### What's mocked right now, and why the mock is structured the way it is

[coordinator/server.js](coordinator/server.js) implements this shape entirely in memory, with no real Bitrefill account behind it yet. The mock deliberately exposes two layers rather than one:

- A faithful mock of Bitrefill's own API shape (`/api/bitrefill/invoice`, `GET /api/bitrefill/invoice/:id`), so that replacing the mock later is a matter of making those specific handlers proxy to the real `api.bitrefill.com` instead of touching an in-memory `Map`.
- Atlus's own convenience endpoints (`/api/atlus/create-payment`, `/api/atlus/complete-payment`), which are the only ones the extension ever calls. This is the layer of indirection that matters: the extension's contract with "the coordinator" doesn't change when the card provider underneath does.

Step 2 above (the user's wallet actually sending crypto) is entirely skipped in the current mock: `complete-payment` marks the invoice paid immediately rather than waiting for a real payment to land. That's the same "simulate the settlement gap" pattern used everywhere else in this project so far, not a new shortcut invented for Bitrefill specifically.

### Still open

- No live Bitrefill account exists yet. Getting one, and understanding their actual fee structure, product catalog (which card denominations/brands they actually support), and settlement-detection mechanism (webhook vs required polling), is unstarted.
- The "user's wallet sends crypto directly to Bitrefill's payment address" step has no real implementation. This is where an actual on-chain transaction would need to be constructed and signed by the user's connected wallet, currently the flow just assumes it already happened.
- Prior-art references to Stripe Issuing / Marqeta earlier in this file (the escrow proof-of-payment section, the monetization section) describe reasoning from before this pivot. Left as-is rather than rewritten, since they're an accurate record of what was being considered at the time, but Bitrefill is the current plan, not those.

---

## 2026-07-30 - Real Bitrefill integration: the spec didn't match the real API, and the payment leg moves to mainnet

A detailed integration spec arrived describing "the real Bitrefill sandbox API." Before writing any code against it, the actual claims were checked against Bitrefill's real, published documentation (docs.bitrefill.com). They didn't hold up:

- `api-sandbox.bitrefill.com` doesn't resolve. No separate sandbox host exists.
- The described endpoints (`POST /v1/invoices` returning `{ payment: { address, amount } }`, later paid invoices including a `card` object with raw number/expiry/CVV) don't match Bitrefill's real API shape at all.
- Bitrefill's real "test products" (their actual sandbox equivalent) only work with `payment_method: "balance"`, meaning testing anything, even the free test SKUs, requires a real crypto deposit into an account balance first. There is no free, testnet-payable path through Bitrefill at all.
- No test product resembling a card exists. The real test SKUs are generic gift-card-link/code and phone-refill simulations only.

This was a genuinely useful thing to check before building, since the original spec's assumptions (a free sandbox, testnet crypto acceptance, a single-call invoice-to-card flow) were all wrong, and building against them would have produced code that looked complete but would fail entirely against the real API.

### What's real, verified directly against Bitrefill's docs

- Bitrefill does sell an actual "Digital Prepaid Visa" product, real crypto in, a real usable Visa card number/expiry/CVV out, confirmed on Bitrefill's own product page (not just their API docs).
- Direct per-order crypto payment is real and doesn't require pre-funding an account balance: `POST https://api-bitrefill.com/v2/invoices` with a `products` array and a `payment_method` (e.g. `"ethereum"`) returns a payment address and amount for that specific order. This is what keeps the non-custodial framing intact, the end user's wallet pays Bitrefill's invoice address directly, Atlus never touches the funds.
- Order fulfillment detail (`GET /orders/:id`) returns a `redemption_info` field that is free text, not structured card fields. Whether a real Digital Prepaid Visa order's `redemption_info` contains a cleanly parseable card number/expiry/CVV, and in exactly what format, is unconfirmed until a real order is placed. Full detail and the parser's current best-effort approach are in [coordinator/README.md](coordinator/README.md).

### The payment leg has to move to real Ethereum mainnet, not Sepolia

Bitrefill can't detect a payment on a network where the currency has no value, so `payment_method: "ethereum"` almost certainly watches real mainnet. This is a genuine first for this project: every other part, the website's wallet connection, every prior transaction, every disclosure page, has been testnet-only with the explicit framing "no real funds move through this deployment." The extension's payment step is now the one part of Atlus Pay that moves real money, confirmed directly with the project owner before writing the wallet-sending code, given the consequence of getting this wrong. Two safety measures on top of MetaMask's own confirmation screen (the real last check, the user always sees the exact amount before approving):

- `MAX_SPEND_USD` (coordinator-enforced, default $20) rejects an invoice request before it ever reaches Bitrefill.
- The Bitrefill product_id is never auto-discovered at request time. It's a required, manually-verified env var, so a bad product search match can never silently buy the wrong thing.

### Architecture change: full-page overlay instead of a popup window

The earlier design used a small `chrome.windows.create` popup for payment confirmation. The new spec asked for a full-page overlay injected directly into the checkout page instead, covering the viewport while the payment runs. This also meant retiring the small `popup.html`/`popup.js` window entirely, the whole flow (wallet connect, balance display, confirm, progress states, error handling) now lives in `content.js`, built and torn down as DOM elements on the page itself.

### Why wallet calls go through an injected page-context script

Chrome extension content scripts run in an isolated JS world: they share the DOM with the page but not arbitrary window properties. MetaMask injects `window.ethereum` into the page's own world, which an isolated-world content script can't reliably reach directly. The standard, robust pattern (used by real wallet-interacting extensions) is to inject an actual `<script>` tag that runs in the page's world and can see `window.ethereum`, then talk back to the content script over `window.postMessage`, exactly the same pattern `wallet-bridge.js` already used to talk to the website. `injected.js` is that script.

### ethers.js was dropped, on purpose

The spec asked to bundle `ethers.min.js`. For code that sends real money, a small number of directly readable EIP-1193 calls (`eth_requestAccounts`, `eth_chainId`, `wallet_switchEthereumChain`, `eth_getBalance`, `eth_sendTransaction`) plus one explicit BigInt-based decimal-ETH-to-wei conversion felt more trustworthy than vendoring a large third-party minified bundle blind. Every line that touches the transaction amount is now auditable in `content.js` directly.

### Auto-submit was deliberately left out

The spec mentioned optionally auto-clicking the merchant's "Place Order" button. Given real crypto is now being spent to obtain the card, auto-submitting the merchant's own purchase form on top of that stacks a second real-world consequence (an actual completed purchase) on an automated action. The card fields get filled; final submission stays a manual, visible click the user makes themselves.

### Fixed card denominations, and the real fix: a shared liquidity pool (not built yet)

The configured product (`the-visa-digital-gift-card-australia`, the only Visa product this Bitrefill account can actually see, see the entry below on why it's AUD not USD) only comes in fixed packages: $10/$50/$100/$250. A checkout total almost never lands exactly on one of those, so covering it means buying a package sized up to the nearest one that covers it, leaving unspent value on the card.

The shape of the real fix, to build once the base single-card flow is proven against a real order, not before:

1. **A user only ever pays crypto for the exact amount they need**, not the card's full face value. Buying a $250 card for a $110 order means the user pays for $110 in crypto; Atlus fronts the rest of the card's cost and gets it back from the pool later.
2. **The $140 left on that card doesn't get wasted, it joins a shared pool**, available to any future order across any user, not scoped to the original buyer's account. A later $140 order gets allocated that exact card directly, no new Bitrefill purchase, no new crypto spent at all.
3. **At scale, this converges**: as more transactions happen, the pool naturally accumulates cards across a spread of remaining balances, and a growing share of orders get matched against existing inventory instead of requiring a new purchase. The "waste" from any one oversized purchase becomes the next several orders' free inventory.

This is real infrastructure, not a tweak: a pool table (card id, remaining balance, currency), a matching algorithm (closest-fit existing card, else buy new), and genuine refund logic, sending the unused crypto difference back to the paying user's wallet, which is its own real-money operation with its own failure modes (gas costs on the refund transaction, what happens if the refund itself fails, etc.) and needs the same level of care this file has been giving every other real-money path. Deliberately sequenced after the current single-card flow is verified against one real transaction, not before, so a bug in the foundation doesn't get built on top of.

---

## 2026-07-30 - Payment currency switched from ETH to USDC: the ETH unit couldn't be verified

While preparing for the first real test, `payment.price` in a real Bitrefill invoice response for `payment_method: "ethereum"` came back as `3769` with `currency: "ETH"`. That number doesn't resolve to a sane amount under any standard Ethereum unit: not wei (18 decimals, ~$0.00000000000004), not gwei (9 decimals, ~$0.00001). Bitrefill's own API docs don't document the unit for this field at all (confirmed by checking `docs.bitrefill.com/reference/post_invoices.md` directly, the schema only shows an undocumented `"type": "number"`).

### How this was actually resolved, not guessed

Created the same $10 AUD card invoice with two other payment methods that have universally fixed, well-known decimal standards, independent of anything Bitrefill documents:

- `payment_method: "usdc_base"` returned `price: 7190000`, `currency: "USDC"`. USDC is fixed at 6 decimals by the token standard itself. `7190000 / 10^6 = 7.19 USD`, a sane price for a $10 AUD card.
- `payment_method: "bitcoin"` returned `price: 11153`, `currency: "BTC"`. Satoshis are BTC's fixed 8-decimal standard. `11153 / 10^8 ≈ 0.00011153 BTC`, roughly $7.81 USD at a plausible BTC price, the same ballpark as the USDC figure.

Both independently confirm the real pattern: `price` is in the currency's own smallest standard unit. ETH should follow the same rule, and doesn't produce anything sane under it, which points at either an API inconsistency specific to how Bitrefill quotes ETH, or a unit this investigation didn't find documented anywhere. Rather than trust a guess with real money, ETH was dropped as a payment option entirely.

### Decision: USDC on Base

- **Unit is provably correct**, not inferred: 6 decimals is the fixed ERC-20 standard for USDC, not something specific to Bitrefill's API that could be wrong or undocumented.
- **Stays inside the already-built and already-tested wallet stack**: MetaMask/Phantom, `window.ethereum`-shaped calls, no new wallet integration. The only real changes were the chain (Base, `0x2105`, instead of mainnet) and the transaction shape (an ERC-20 `transfer()` call instead of a native value transfer).
- The real USDC contract address on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) was verified against two independent sources, Circle's own contract address documentation and BaseScan's verified listing, before being hardcoded anywhere, given a wrong contract address here would mean a transaction that either fails outright or (worse) succeeds against the wrong contract.
- Native Bitcoin was considered and ruled out for the *payment* leg specifically (as opposed to the unit-verification test above, which only needed to create an unpaid invoice, not send anything): it requires an entirely separate wallet integration, no smart contracts, no `window.ethereum`-equivalent standard, no MetaMask support at all, a materially bigger and untested change to make before a first real transaction than switching to USDC.

### A related idea, considered and explicitly ruled out for now: swap-then-pay in one transaction

A separate proposal (sourced from another AI, not independently verified before being brought here) described letting a user pay in *any* crypto, atomically swapped to USDC via a DEX aggregator and forwarded to Bitrefill in a single signed transaction, hidden behind one MetaMask popup. Checked this before building anything against it, the same way the original fictional Bitrefill spec was checked:

- **It cannot work for native Bitcoin at all.** DEX aggregators (1inch, ParaSwap, etc.) operate on EVM chains via smart contracts. Bitcoin has no smart contract capability compatible with this and MetaMask cannot sign a Bitcoin transaction under any circumstance. This isn't unverified, it's a category error, conflating native BTC with an EVM-wrapped representation of it (WBTC).
- **For genuinely EVM-compatible assets** (ETH, WBTC, other ERC-20s), an atomic swap-and-forward is technically real, but requires either a custom smart contract (real audit surface, since it would briefly hold swapped funds) or ERC-4337 account abstraction (substantial, still-maturing infrastructure). Neither is a small addition.

Given the base single-currency flow hadn't been proven against one real transaction yet, adding a DEX aggregator and a new smart contract on top was the wrong sequencing. Logged here as a real future direction, explicitly scoped to EVM assets only, not attempted now.

### Also fixed alongside this: Phantom couldn't connect at all

`injected.js` only checked `window.ethereum`. Phantom's EVM interface lives at `window.phantom.ethereum` instead (the same discovery already made for the website's own wallet connect, see the Phantom wallet entries earlier in this file, but the extension's wallet bridge hadn't picked up the same fix). A Phantom-only user (no MetaMask installed) would hit "No wallet extension detected" with no way to proceed. Fixed by checking `window.phantom?.ethereum` first, falling back to `window.ethereum`. Verified with a mock that set only `window.phantom`, no `window.ethereum` at all, and confirmed the full flow (connect, chain switch, balance, transaction construction) worked identically to the MetaMask path.

---

## 2026-07-31 - Desktop app: two real Electron bugs, and a blocked Bitrefill product

### Two bugs found while bringing up the Electron BrowserView

The checkout test page rendered correctly in a normal Chrome tab but came up black-background/unstyled inside the Atlus desktop app's `BrowserView`. Since this is a real, reproducible bug (not a spec-verification question), it was diagnosed directly: added temporary `console-message`/`preload-error` listeners on the `BrowserView`'s `webContents` and ran the app headfully (not through screenshots asked of the user - captured `webContents.capturePage()` programmatically instead, which is faster and doesn't require the user's screen). Two real, separate bugs surfaced:

1. **Electron sandboxes preload scripts by default (since Electron v20).** A sandboxed preload's `require()` is restricted to a small built-in whitelist, it cannot load an arbitrary installed npm package. `inject/checkout.js`'s top-level `require("qrcode")` was silently failing every load with `Unable to load preload script... module not found: qrcode`, meaning the entire preload script - checkout detection included - never ran. Fixed with `sandbox: false` on the `BrowserView`'s `webPreferences`. `nodeIntegration` stays `false`, so this only grants Node access to the trusted preload script, not to the (untrusted, arbitrary) page content it runs alongside.
2. **`document.documentElement` can be `null` when a preload script's top-level code runs.** Unlike a Chrome extension content script (which Chrome only ever runs once a DOM exists), an Electron preload script can execute before the page's HTML has been parsed at all. `checkout.js` called `new MutationObserver(...).observe(document.documentElement, ...)` at the top level, which threw `Failed to execute 'observe': parameter 1 is not of type 'Node'` on pages where this raced ahead of parsing, aborting the whole script. Fixed by deferring that call to `DOMContentLoaded` when `document.readyState === "loading"`.

Once both were fixed, `capturePage()` confirmed the checkout page renders correctly (white background, all text/labels present, "Pay with Atlus" button injected above the card field), and a simulated click through `executeJavaScript` confirmed the overlay, order-total detection, and a real WalletConnect `client.connect()` pairing URI rendered as a scannable QR code all work end-to-end, with no real funds moved.

### The requested pivot: drop fixed-package cards, use Bitrefill's US variable-amount Visa instead

The card system was going to change: instead of picking the cheapest fixed package that covers the checkout total (and eating the difference as waste, see the AUD product below), the plan was to use Bitrefill's **Digital Prepaid Visa (USA)** product (`bitrefill.com/us/en/gift-cards/virtual-prepaid-visa-usa/`), which the product page confirms is a genuine variable-amount card (enter any dollar amount, no fixed denominations), up to a $1,000/week limit, and asks for a cardholder first/last name at purchase time. That part of the incoming spec checked out against Bitrefill's real product page.

**What didn't check out: this account cannot access that product at all, independent of network/IP.** Calling the real API directly:

- `GET /v2/products/virtual-prepaid-visa-usa` → **`403`, `error_code: "not_available"`, `"This product is not available for your account"`.**
- The same account's existing AU product (`the-visa-digital-gift-card-australia`, already working) → `200`.
- Two other countries' general-purpose prepaid cards, picked specifically to isolate whether this was a "USA" problem or a "general-purpose card category" problem → `prepaid-mastercard-south-africa` → `200`, `phone-visa-pinless-canada` → `200`.

That isolates the block to the USA product specifically, on this account, and it is an account-level rejection, not a geo/IP block - the error text says "for your account," and Bitrefill's own product terms for this card state it is "exclusively available to US residents," which reads as an identity/eligibility gate Bitrefill checks per-account, not a firewall a proxy could get around. Also checked: none of the three accessible general-purpose cards (AU, ZA, CA) support a variable amount either - all three are fixed-package only, same as the current AUD product. So right now, on this account, there is no product that is both accessible and variable-amount.

**The incoming spec's "connect through a US IP using a built-in proxy/VPN" idea was not built, for two reasons, not one:** first, it would not fix this specific error, since a 403 tied to account eligibility does not care what IP the request came from; second, Bitrefill's own terms state that circumventing geoblocking to buy a product not available to your account is a violation that can get the account suspended - building that would risk the working AU integration along with everything else on this API key, to chase a fix that would not have worked anyway. This is the same category of catch as the earlier fictional-API-spec and native-BTC-atomic-swap findings above: verify the concrete, testable claim before writing code around it, not after.

**Not yet resolved:** whether this account can be upgraded/verified to access the USA Visa product is a Bitrefill-side question (likely account verification or a different API tier), not a code question, and needs a decision on how to proceed - continue with a fixed-package product for now, or pursue access to the USA product through Bitrefill directly.

---

## 2026-07-31 - The card system changes again: merchant gift cards, not a universal Visa

### The AU Visa card, the one thing still "working," turned out not to work either

Before replacing it with anything, it was worth checking why the user described the AU card as going through "this bs card network thing" to redeem, since if that concern was right, the entire fixed-package Visa design documented above was never going to reach a working end state, independent of the USA account block. It was right. Checked directly against the issuer's own instructions (`card.gift`, "The Card Network"):

- No plain card number, expiry, or CVV is ever shown as text.
- Redemption is: get an SMS, download the TCN app, add the card to Apple Pay/Google Pay, and it **only works inside a digital wallet set to the Australia region.**
- Activation itself **requires a valid Australian mobile number.**

There is nothing here Atlus's autofill could ever use, wallet-tokenized cards have no PAN to type into a checkout form. This is a bigger finding than the USA account block above: the AU integration was never actually going to reach a working payment, this just hadn't been checked yet. By contrast, Bitrefill's own support docs for the **USA** Virtual Prepaid Visa describe exactly the redemption model Atlus needs (full number/CVV/expiry shown as text, no app), which made the account block above sting more, that product would have worked, this account just can't buy it.

### Brainstorming a replacement, with the user

Rather than chase a third Visa-shaped product, the user asked to brainstorm other directions entirely. Several were discussed (detecting merchants that already accept crypto directly, a P2P payment-request tool, Bitrefill's separate reloadable Card product), landing on the one that reuses everything already built and needed no new Bitrefill account access: **buy the checking-out merchant's own gift card instead of a universal card.** Bitrefill's catalog is mostly merchant-specific gift cards (Target, Starbucks, Uber, thousands of others), and those aren't wallet-tokenized or phone-gated the way the Visa products turned out to be, they redeem as a plain code.

The obvious follow-up concern, raised immediately: gift cards are typically fixed-denomination too, so wouldn't this just reintroduce the same overpay problem the Visa card had?

### Checking that concern against real data instead of assuming either way

First pass, 9 popular US merchants checked directly against `GET /v2/products/:id`: 6 of 8 valid results supported a custom amount (a `range` object with `min`/`max`/`step: 0.01`), not fixed packages. Asked to widen this to a real sample instead of guessing from 9: surveyed 77 everyday retailers (searched then fetched individually against the live API, not fuzzy-matched) across food, retail, electronics, beauty, travel, and gaming, in the US, UK, Canada, Australia, and a few global gaming platforms.

Corrected results (the first pass undercounted the UK/Canada/Global numbers due to a rate-limiting bug in the survey script that silently produced `fetch_failed` for products that were actually accessible; re-fetched with retries before drawing conclusions):

| Region | Custom-amount | Fixed-only | % custom |
|---|---|---|---|
| US | 27/33 | 6 | 82% |
| UK | 8/11 | 3 | 73% |
| Canada | 3/5 | 2 | 60% |
| Global (Steam, PSN, Nintendo, Razer, Roblox) | 2/4 | 2 | 50% |
| Australia | 10/24 | 14 | **42%** |
| **Overall** | **50/77** | **27** | **65%** |

A real, specific pattern: Australia is notably worse than everywhere else. Woolworths, Coles, Myer, Bunnings, Officeworks, Chemist Warehouse, BIG W, and Webjet are all fixed-denomination only, while their closest US equivalents mostly aren't. This matters for setting expectations honestly rather than claiming one uniform experience: US users get exact-amount, zero-waste gift cards for most everyday purchases, Australian users get that meaningfully less often with the current catalog.

Confirmed separately, directly against the real invoice API (not assumed from the product schema): a ranged product accepts a `value` field (e.g. `"5.00"`) instead of `package_id`, and the resulting invoice priced it exactly, `payment.price: 5000000` for a $5.00 Starbucks card, 6-decimal USDC, no rounding. This is a real (but harmless, unpaid, never sent-to) test invoice, not a simulated response.

### What got built

- **`coordinator/retailers.js`**: a hand-curated catalog (~50 entries) mapping a real domain to a real, individually-checked `product_id`. Deliberately excludes several bad fuzzy-search matches surfaced during the survey (a "steam usa" search returned Ruth's Chris Steakhouse, "next uk" returned a Ukrainian phone operator, "mcdonalds usa" returned McDonald's Denmark) - the same "never guess a product_id at request time" discipline the single `BITREFILL_VISA_PRODUCT_ID` env var used to enforce, just applied to a list now instead of one value.
- **`create-payment`** now takes `productId` and branches: if the product's `range` covers the requested amount, buys that exact value (`exact: true`), otherwise falls back to the old cheapest-covering-package logic (`exact: false`), so the desktop app can show "exact match, no waste" instead of a generic waste warning when it applies.
- **A priority chain in `checkout.js`**, checked before any wallet connects: does this site already accept crypto directly (best-effort scan for known gateway domains in scripts/iframes/links) → does `retailers.js` have a verified product for this exact domain → neither, say so plainly. No fallback to a generic card exists anymore, since there isn't a working generic card to fall back to.
- **Gift-card field detection**, separate from the existing credit-card field detection: most of these products redeem through a "gift card / promo code" field, not `cc-number`/`cc-exp`/`cc-csc`. There's no `autocomplete` token for this the way there is for credit cards, so it's explicitly weaker, unreliable detection is expected, not an edge case. The overlay always shows the raw `redemption_info` text as a copy-paste fallback regardless of whether auto-fill found a field, specifically because of that.
- **The Atlus app's UI changed to match**: no more general address bar/search. The window opens on a searchable grid of the retailer catalog (`desktop/home/`), and picking one just navigates there, a plain link. Atlus now visibly only claims to work on sites it's actually checked, instead of implying "any checkout" the way a free-text browser would.

### Verification method for this round

Same approach as the ETH-unit investigation and the USA-Visa-block investigation earlier in this file: real API calls against the live Bitrefill account, not documentation alone, and not the survey's own fuzzy-search results taken at face value (the mismatches above were caught by inspecting the actual matched product, not by trusting the query that found it). The desktop app's new flow was exercised end-to-end (home screen → a real merchant's gift-card checkout page → wallet QR shown) using `webContents.capturePage()` for verification instead of asking for repeated manual screenshots, consistent with the earlier BrowserView bug-fixing session.
