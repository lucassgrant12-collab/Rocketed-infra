# Slides

Presentation deck for Atlus Pay. Each slide is numbered and self-contained. Every second slide carries real code pulled from the actual files in this repo, not illustrative pseudocode. See [BUILD_LOG.md](BUILD_LOG.md#slide-format-convention-reference) for the format convention this follows.

When something breaks and gets fixed, both versions go on the slide (broken, then what changed, then working), not just the final answer.

---

## Slide 1 - "There's no 'connect wallet and pay anywhere' button"

**Talking points**
- Existing crypto payment options are custodial, require KYC, or force the merchant to accept crypto directly. None of that is what a normal checkout looks like.
- The first version of this idea required merchants to embed a JS snippet before their customers could pay with Atlus. That is the same adoption bottleneck every "accept crypto" plugin hits. No merchants, no users. No users, no merchants.
- Current version: Atlus Pay ships as a browser extension the user installs. It detects the checkout form itself and injects the button. No merchant integration, ever.

---

## Slide 2 - "Three pieces, one extension"

**Talking points**
- **Website** (Next.js) handles onboarding: email, wallet connect, and getting the extension installed.
- **Extension** (Manifest V3) is what the user actually interacts with at checkout. It detects the card form, opens a confirmation popup, and fills the card fields once payment completes.
- **Coordinator** is the backend the extension talks to for the actual swap and card issuance. Currently mocked; the shape mirrors a hashlock.

**Code piece 1, the extension's permission surface**
```json
{
  "permissions": ["activeTab", "scripting", "storage"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"] },
    { "matches": ["http://localhost:3000/*"], "js": ["wallet-bridge.js"] }
  ]
}
```

**Code piece 2, the file layout that maps to those three pieces**
```
web/            the website (onboarding, legal pages, API routes)
extension/      the browser extension (content.js, background.js, popup)
supabase/       SQL migrations, run manually against the Supabase project
```

**How they connect:** `content.js` runs everywhere because it has to find a checkout form on any site. `wallet-bridge.js` is scoped to only the Atlus Pay website, because its entire job is reading the connected wallet off that one page, not merchant pages. The permission list is the extension's actual attack surface, worth checking first whenever something looks wrong.

---

## Slide 3 - "Onboarding is three steps, in order"

**Talking points**
- Step 1: email. Step 2: connect a wallet. Step 3: get the extension, which only appears once a wallet is actually connected.
- Gating step 3 behind a connected wallet is deliberate. Getting the extension before there's an account to attach it to is a dead end.
- The same card component renders all three steps. There's no separate page navigation, just conditional rendering off two pieces of state (`emailConfirmed`, `isConnected`).

---

## Slide 4 - "One component, three steps, derived state"

**Talking points**
- The step number isn't stored in state. It's derived from what's already true, so there's no way for the UI to get out of sync with reality (e.g. showing "step 2" while a wallet is actually already connected).

**Code piece 1, deriving the step instead of storing it**
```tsx
const step = !emailConfirmed ? 1 : !isConnected ? 2 : 3;
```

**Code piece 2, saving once step 3 is reached**
```tsx
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

**How they connect:** the derived `step` decides what renders. The effect decides what gets saved, and it only fires once both conditions the derived step already checked are true. Two different mechanisms reading the same underlying state, which is why they can't drift apart.

---

## Slide 5 - "Detecting a checkout form without asking the merchant for anything"

**Talking points**
- No merchant integration means the extension has to find the card number field itself, on a page it has never seen before.
- The approach: a list of common `autocomplete`, `name`, and `id` patterns real checkout forms use, checked in order.
- A `MutationObserver` keeps watching after the first scan, since a lot of checkout forms render after the initial page load (single page app checkouts, async payment steps).

---

## Slide 6 - "Finding the field, then actually filling it"

**Talking points**
- Finding the field is the easy half. Filling it in a way a real, modern checkout form notices is the part that actually breaks if done naively.

**Code piece 1, the selector list**
```js
const CARD_NUMBER_SELECTORS = [
  'input[autocomplete="cc-number"]',
  'input[name*="cardnumber" i]',
  'input[name*="card-number" i]',
  'input[id*="cardnumber" i]',
  'input[name*="cc-number" i]',
];
```

**Code piece 2, the fix that made autofill actually work**
```js
// Broken idea: field.value = cardNumber, silently ignored by any
// checkout form built with React or Vue, since they track input through
// framework state, not the raw DOM value.

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

**How they connect:** skipping the second piece would have made the extension look broken on exactly the checkout pages that matter most, since almost every real store runs on React or Vue, not a plain static form.

---

## Slide 7 - "What happens between clicking the button and the card appearing"

**Talking points**
- Click "Pay with Atlus" on the checkout page, a small popup opens showing the detected amount.
- Confirm in the popup, and the service worker calls the coordinator twice: once to open a hashlocked order, once to reveal the card after a simulated settlement delay.
- The card details go back to the exact tab that started the payment, never to the popup, never broadcast anywhere else.

---

## Slide 8 - "The two-step coordinator call"

**Talking points**
- The shape here (lock, then reveal) mirrors a real hashlock or HTLC. In a real deployment the secret would be revealed by an on-chain transaction settling, not handed back directly by the server.

**Code piece 1, opening the order**
```js
const payResponse = await fetch(`${COORDINATOR_URL}/api/pay`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount, merchant: paymentState.merchant, walletAddress }),
});
const { orderId, secret } = await payResponse.json();
```

**Code piece 2, revealing the card**
```js
await new Promise((resolve) => setTimeout(resolve, 200)); // simulated settlement gap

const revealResponse = await fetch(`${COORDINATOR_URL}/api/reveal`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ orderId, secret }),
});
const { cardNumber, expiry, cvv } = await revealResponse.json();
```

**How they connect:** the 200ms delay between them isn't padding, it's standing in for the real gap between a swap being submitted and a swap actually settling on-chain, so the UI shape (lock, wait, reveal) is honest even though the wait itself is fake for now.

---

## Slide 9 - "The extension doesn't know your email. The website does."

**Talking points**
- The extension only ever learns a wallet address, never an email. Privacy by construction, not by promise.
- The website already knows both, once you've onboarded. It relays the wallet address to the extension the moment you connect, over `window.postMessage`.
- The extension stores it in `chrome.storage.local` so it survives a service worker restart, and attaches it to every payment going forward.

---

## Slide 10 - "A one-way bridge, and only on one page"

**Talking points**
- This content script is scoped to the Atlus Pay site only (see Slide 2's manifest snippet), so it never runs on a merchant's checkout page.

**Code piece 1, the website side**
```tsx
useEffect(() => {
  if (isConnected && address) {
    window.postMessage(
      { source: "atlus-pay-website", type: "WALLET_CONNECTED", address },
      window.location.origin
    );
  }
}, [isConnected, address]);
```

**Code piece 2, the extension side**
```js
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "atlus-pay-website") return;

  if (event.data.type === "WALLET_CONNECTED" && event.data.address) {
    chrome.runtime.sendMessage({ action: "walletConnected", address: event.data.address });
  }
});
```

**How they connect:** the `source: "atlus-pay-website"` marker in both directions matters. `window.postMessage` is otherwise readable by anything else injected on the page, so the extension checks that marker before trusting a message at all.

---

## Slide 11 - "Every payment ends with an email, not a hope"

**Talking points**
- The old flow said "the user gets a confirmation." That was aspirational until there was a backend that actually recorded a transaction and sent something.
- Now: the moment a payment succeeds, the extension fires a request at the website recording the transaction and, if that wallet has a known email, sending a summary.
- It's fire and forget on purpose. The payment already succeeded from the user's point of view once the card is filled; a failed email shouldn't retroactively look like a failed payment.

---

## Slide 12 - "Recording the transaction and sending the receipt"

**Talking points**
- Runs server side with the Supabase service role key, since it needs to look up an email by wallet address, something the browser's anon key is deliberately not allowed to do.

**Code piece 1, the extension's fire and forget call**
```js
function notifyWebsiteOfTransaction(details) {
  fetch(`${WEBSITE_URL}/api/transactions/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  }).catch((error) => {
    console.warn("Atlus Pay: failed to record transaction / send confirmation email", error);
  });
}
```

**Code piece 2, the route that records and emails**
```ts
await supabaseAdmin.from("transactions").insert({ wallet_address, amount, merchant, card_last4 });

const { data: user } = await supabaseAdmin
  .from("users")
  .select("email")
  .eq("wallet_address", walletAddress)
  .maybeSingle();

if (user?.email) {
  await resend.emails.send({ from: FROM_ADDRESS, to: user.email, subject: "Payment confirmed", html });
}
```

**How they connect:** the transaction gets recorded either way. The email is best effort on top, since a wallet that hasn't onboarded through the website has no email to send to at all.

---

## Slide 13 - "Proving three async scripts don't double-charge anyone"

**Talking points**
- The extension has three separate scripts (content script, service worker, popup) all talking to each other asynchronously. The kind of system where a bug shows up as "the user got charged twice," not a stack trace.
- Tested against a throwaway mock coordinator with a real loaded copy of the extension via Playwright, not just code review.
- First-ever run showed two `/api/pay` calls for one click. Instead of assuming it was a fluke, added instrumentation and reran with a clean browser profile.

---

## Slide 14 - "What the instrumentation proved"

**Code piece 1, the instrumentation**
```js
const SW_INSTANCE_ID = Math.random().toString(36).slice(2, 8);
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log("[bg]", SW_INSTANCE_ID, "received", message.action, JSON.stringify(message));
  // ...
});
```

**Code piece 2, what four runs showed**
```
Run 1 (first-ever load):  order_1 {amount only}  ->  order_2 {full body}   2 calls
Run 2 (fresh profile):    order_2 {full body}                             1 call
Run 3 (fresh profile):    order_3 {full body}                             1 call
Run 4 (fresh profile):    order_4 {full body}                             1 call
```

**How they connect:** a single service worker instance ID appearing exactly once per confirmed run, across three clean repeats, rules out the message-passing logic as the cause. Points at a one-off Chrome extension first-install lifecycle quirk instead. Debug logging was removed once that conclusion was reached; it was a diagnostic, not a shipped feature.

---

## Slide 15 - "Real product means real disclosures"

**Talking points**
- Atlus Pay currently runs on a test network with a sandboxed card issuer, but it's built to eventually handle real funds. The legal pages say that plainly instead of hiding behind "just a test project."
- Terms, Privacy, and a Risk & Third-Party Disclosures page now sit behind every page of the site, not just the homepage.
- The disclosures page lists every external service the product actually depends on today (Supabase, Resend, Reown, wagmi, Sepolia, Stripe Issuing sandbox), not a generic boilerplate list.

---

## Slide 16 - "One layout, every page"

**Code piece 1, the shared shell**
```tsx
<body className="min-h-full flex flex-col">
  <Providers>
    <Header />
    <div className="flex flex-1 flex-col">{children}</div>
    <Footer />
  </Providers>
</body>
```

**Code piece 2, the reusable legal page shape**
```tsx
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {children}
      </div>
    </section>
  );
}
```

**How they connect:** moving Header and Footer into the root layout meant Terms, Privacy, and Disclosures got consistent navigation for free the moment they were created, rather than needing their own header/footer copy pasted into each page.

---

<!-- Next slide: whichever real coordinator work happens next. Slide 8's mocked /api/pay and /api/reveal are the highest-risk piece still left to build for real, per RESEARCH.md's escrow proof-of-payment section. -->
