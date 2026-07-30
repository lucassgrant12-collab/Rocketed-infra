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
