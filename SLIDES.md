# Slides

Presentation deck for Atlus Pay. Each slide is numbered and self-contained. See [BUILD_LOG.md](BUILD_LOG.md#slide-format-convention-reference) for the format convention this follows.

Slides get filled in with real code as the system is built — the code slides below are placeholders until then. When something breaks and gets fixed, both versions go on the slide (broken → what changed → working), not just the final answer.

---

## Slide 1 — "There's no 'connect wallet and pay anywhere' button"

**Talking points**
- Existing crypto payment options are custodial, require KYC, or force the merchant to accept crypto directly — none of that is what a normal checkout looks like.
- A user sitting on gains in a volatile coin has to manually cash out, pay tax, and wait days before they can actually spend it.
- Atlus Pay's premise: a non-custodial payment layer that works on *any* checkout, for *any* crypto, without the user or Atlus ever touching fiat directly. The merchant never even knows crypto was involved.

---

## Slide 2 — "Three components, none of which hold your money"

**Talking points**
- **User Vault** — non-custodial smart-contract wallet (or connected EOA), secured by guardian recovery via Shamir secret sharing. The user controls it, not Atlus.
- **Payer Node Network** — liquidity providers who stake capital and use their own fiat rails (virtual Visa cards, bank APIs) to pay merchants on the user's behalf, earning fees for doing so.
- **Atlus Protocol Core** — off-chain coordination (relayer, double-entry ledger) plus on-chain escrow contracts that atomically hold stablecoins until proof of fiat payment is provided. Atlus itself never holds funds at any point.

**How they connect:** the Vault initiates and signs, the Protocol Core coordinates and holds funds in escrow only transiently, and the Payer Node is the only party that ever touches fiat. Removing any one of the three breaks the "non-custodial" claim — e.g. without the Payer Node network, Atlus would have to touch fiat itself.

**v1 note (2026-07-29):** for v1, Atlus *is* the sole Payer Node ("Treasury Model") — it converts crypto to USDT itself and pays merchants directly, keeping the spread as profit. The independent, third-party Payer Node Network described above is the v2 scaling step, not how v1 actually works. This means v1's protocol is custodial of the converted stablecoin, even though the User Vault stays non-custodial — see [RESEARCH.md](RESEARCH.md#tension-to-flag-this-changes-the-non-custodial-claim-for-v1) for why that distinction matters.

---

## Slide 3 — "The payment flow, step by step"

**Talking points**
0. **Onboarding** — user enters a username, then connects their wallet. No separate KYC step at v1.
1. **Checkout integration** — merchant embeds the Atlus Pay JS snippet; a "Pay with Atlus" button carries amount, currency, order ID.
2. **Auth & authorization** — Apple-Pay-style popup shows the exact fiat amount and merchant; user authenticates via biometric/passkey. Atlus fetches a live price quote and the best DEX swap route.
3. **Atomic swap & escrow lock** — one signed meta-transaction: approve crypto → swap to USDC via DEX aggregator → deposit into escrow. Submitted by an Atlus relayer, so the user needs no gas tokens.

---

## Slide 4 — "The payment flow, continued: fronting the fiat"

**Talking points**
4. **Payer Node fronts the fiat** — sees USDC land in escrow, instantly issues a one-time virtual Visa card for the exact amount via its own card-issuing API. The Atlus snippet injects the card number into the merchant's checkout form. Target: under 2 seconds from tap to authorization.
5. **Proof of payment & escrow release** — Payer Node submits proof (webhook, receipt, or transaction ID) to the escrow contract, which verifies it and releases the USDC.
6. **Ledger finalization** — Atlus's off-chain double-entry ledger updates the user's balance and marks the obligation settled. User gets an **email confirmation**.

**How they connect:** step 3's escrow lock is the precondition that makes step 4 safe for the Payer Node to act on — they only front real fiat because the USDC is already provably committed on-chain. Step 5 is what lets them recover it. Break the link between "escrow locked" and "Payer Node will act" and the whole under-2-second UX target falls apart.

---

## Slide 5 — "Proof of payment: the trust-critical piece"

**Talking points**
- Whoever decides "the merchant got paid" controls whether a Payer Node can drain escrow without actually paying anyone — this is the single biggest technical risk in the system.
- **Naive approach (rejected):** Payer Node self-reports via API call. Nothing stops a false claim.
- **Trusted-oracle approach:** card issuer webhook (Stripe Issuing / Marqeta) confirms settlement; an oracle attests to it on-chain. Moves trust from the Payer Node to the issuer + oracle.
- **Multi-source cross-check:** several independent attestors pull card-network data and require consensus, instead of trusting one oracle.
- **ZK approach:** a TLSNotary-style proof of the issuer's API response, verifiable without the issuer needing special integration.
- **Unresolved nuance:** card *authorization* is instant, but *settlement* takes 1-3 days. Does escrow release on proof of authorization (Payer Node takes settlement risk) or proof of settlement (Payer Node waits days for their USDC)? This changes the fee economics and hasn't been decided yet.

---

## Slide 6 — "Design properties that fall out of the architecture"

**Talking points**
- **Non-custodial** — Atlus never possesses user crypto or fiat; escrow is code-controlled, Payer Nodes front their own fiat.
- **Volatility protection** — the instant swap at authorization means the payer only ever receives stablecoins.
- **Privacy** — wallet addresses are never revealed to merchants or Payer Nodes; shipping/personal details are filled client-side, bypassing Atlus servers; blind signatures further decouple authorization from identity.
- **Frictionless UX** — biometric confirmation, gasless meta-transactions, no manual swaps or on-chain waits.
- **Privacy vs. compliance tension (be upfront about this, don't just claim the win):** hiding the wallet address from the Payer Node is in direct tension with that Payer Node's own transaction-monitoring obligations in most jurisdictions once real fiat rails are involved.

---

## Slide 7 — "Who pays whom: the fee model"

**Talking points**
- **Payer Node fee** — the main user-facing cost: a spread for instantly fronting fiat, roughly analogous to a card processing fee or FX spread (indicative 1-3%, scaled by volatility/liquidity — not finalized).
- **Atlus Protocol fee** — a cut of the Payer Node fee, or a flat per-transaction fee, for coordination (relayer/gas sponsorship, ledger, escrow infra).
- **DEX/swap costs** — standard aggregator fee + slippage, paid by the user, not Atlus revenue.
- **Payer Node staking** — capital bond posted by nodes to participate; not direct revenue, but the reason the trust model in Slide 5 is tolerable at all — a lying node has capital at risk.

---

## Slide 8 — "Risks and regulatory shape (not legal advice)"

**Talking points**
- **Money transmission** — Atlus likely avoids MTL/MSB licensing by never custodying funds; Payer Nodes, who do touch fiat, may individually need it depending on jurisdiction.
- **Card issuer risk** — instant, one-time, high-value virtual cards can look like fraud/card-testing to issuer risk models; needs issuer relationships that explicitly tolerate this pattern.
- **Escrow oracle risk** — a compromised or colluding oracle could release USDC without the merchant ever being paid (see Slide 5).
- **Payer Node insolvency** — a failed or disputed merchant charge leaves the node out real fiat with no immediate on-chain recourse; staking mitigates this but slashing conditions aren't defined yet.
- **KYC / sanctions exposure** — non-custodial design doesn't remove KYC obligations from the system, it shifts them onto whichever Payer Node touches fiat rails.

---

## Slide 9 — "What's already built vs. what's next"

**Talking points**
- **Already built (per project owner, not yet in this repo):** double-entry ledger, non-custodial vault with Shamir guardian recovery, RSA blind signature module, adapter pattern for Payer Node fiat rails.
- **Not yet decided:** escrow proof-of-payment mechanism (authorization vs. settlement), fee percentages, Payer Node slashing conditions, KYC responsibility split.
- **Immediate next step:** locate and import the existing tech stack pieces, then pick a build order — proof-of-payment mechanism first, since it's the piece the rest of the trust model depends on.

---

## Slide 10 — "Onboarding, live: email capture + wallet connect"

**Talking points**
- First real piece of the system: the onboarding page. User enters an email, then connects a wallet via RainbowKit. On connect, the pair gets written to Supabase.
- Built on Next.js + wagmi + RainbowKit for the wallet layer, Supabase for persistence — chosen because they're the current standard tools for this and integrate cleanly with each other.

**Code piece 1 — what actually gets written to Supabase on connect**
```ts
useEffect(() => {
  if (!emailConfirmed || !isConnected || !address) return;

  async function saveOnboarding() {
    setStatus("saving");
    const { error } = await supabase
      .from("users")
      .upsert({ email, wallet_address: address }, { onConflict: "wallet_address" });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("saved");
  }

  saveOnboarding();
}, [emailConfirmed, isConnected, address, email]);
```

**Code piece 2 — the config that let the build even run**
```ts
// Broken: threw "No projectId found" during `next build`, before the
// app ever touches WalletConnect — RainbowKit validates at config time.
projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",

// Fixed: fall back to a non-empty placeholder so the build succeeds
// with no env vars set. Real WalletConnect connections still need a
// real project ID — this only unblocks the build/dev server.
projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "atlus-pay-placeholder-project-id",
```

**How they connect:** piece 1 can't run at all unless the app builds and renders first — and piece 2 is exactly what was blocking that. The same failure mode hit the Supabase client too (it originally threw at import time if env vars were missing, which crashes prerendering, not just a runtime request) — fixed the same way, by deferring the failure from "app won't build" to "this specific Supabase call fails, and the UI already has an error state for that." The lesson: validate required config at the point of use, not at module load, or you can't ship a build before secrets exist.

---

## Slide 11 — "Checkout without asking the merchant for anything"

**Talking points**
- Original design required merchants to embed a JS snippet before their customers could pay with Atlus — the same adoption bottleneck every "accept crypto" plugin hits: no merchants, no users; no users, no merchants.
- New model: Atlus Pay ships as a browser extension the *user* installs. It detects the checkout form itself and injects the button — no merchant integration, ever. Same distribution shape as Honey or a password manager's autofill.
- Underlying payment mechanics (swap → lock → fiat leg → reveal → settle) don't change — this pivot is only about how the button gets in front of the user.

**Code piece 1 — detecting a checkout form without any merchant cooperation**
```js
const CARD_NUMBER_SELECTORS = [
  'input[autocomplete="cc-number"]',
  'input[name*="cardnumber" i]',
  'input[name*="card-number" i]',
  'input[id*="cardnumber" i]',
  'input[name*="cc-number" i]',
];

function findField(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}
```

**Code piece 2 — filling a field the way a real keystroke would**
```js
// Broken idea: field.value = cardNumber — silently ignored by any
// checkout form built with React/Vue, because they track input through
// the framework's own state, not the raw DOM value.

// Working version: go through the native setter first, then dispatch
// the events the framework is actually listening for.
function setNativeValue(field, value) {
  const prototype = Object.getPrototypeOf(field);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  nativeSetter ? nativeSetter.call(field, value) : (field.value = value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
```

**How they connect:** piece 1 finds the field, piece 2 is what makes filling it actually work on a real, modern checkout page instead of only on a plain static HTML form. Skipping piece 2 would have made the whole extension look broken on exactly the kind of checkout pages (React/Vue-based) that matter most.

---

## Slide 12 — "One click, one payment: proving the message-passing doesn't double-fire"

**Talking points**
- The extension has three separate scripts (content script, service worker, popup) all talking to each other asynchronously — the kind of system where a bug shows up as "the user got charged twice," not a stack trace.
- No real coordinator exists yet, so this was tested against a throwaway mock server implementing the same two-endpoint hashlock shape (`/api/pay` → `/api/reveal`) the real one will use, driven by a real loaded copy of the extension via Playwright — not just code review.
- First-ever run showed two `/api/pay` calls for one click. Instead of assuming it was fine and moving on, added instrumentation and reran with a clean profile.

**Code piece 1 — the instrumentation that isolated it**
```js
const SW_INSTANCE_ID = Math.random().toString(36).slice(2, 8);
console.log("[bg]", SW_INSTANCE_ID, "service worker (re)started");

chrome.runtime.onMessage.addListener((message, sender) => {
  console.log("[bg]", SW_INSTANCE_ID, "received", message.action, JSON.stringify(message));
  // ...
});
```

**Code piece 2 — what it proved**
```
Run 1 (first-ever load):  order_1 {amount only}  -> order_2 {full body}   -- 2 calls
Run 2 (fresh profile):    order_2 {full body}                            -- 1 call
Run 3 (fresh profile):    order_3 {full body}                            -- 1 call
Run 4 (fresh profile):    order_4 {full body}                            -- 1 call
```

**How they connect:** the instrumentation didn't just confirm "it works" — it proved *which* layer the bug lived in. A single service-worker instance ID appearing exactly once per confirmed run, across three clean repeats, rules out the message-passing logic as the cause and points at a one-off Chrome extension first-install lifecycle quirk instead (the very first activation of a never-before-seen extension ID double-firing lifecycle events). Debug logging was removed once the conclusion was reached — it was a diagnostic, not a shipped feature.

---

<!-- Next slides: replace placeholder code sections above with real code once written. First real code slide should be the escrow contract's proof-verification function, since Slide 5/RESEARCH.md flags it as the highest-risk piece to get right. -->
