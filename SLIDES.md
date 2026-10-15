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

---
---

# Personal requested slides

Separate from the deck above. These are for the school assignment itself (reflective/process slides using this project as the case study), not part of the Atlus presentation deck, kept here so they don't get mixed up with it.

## Running tests/diagnostic

**What happened:**
While testing the desktop app, a checkout page that rendered correctly in a normal Chrome browser came up completely broken when loaded inside Atlus's own embedded browser window: black background, missing headings and text, unstyled form fields.

**Issues:**
The exact same page worked fine in a real browser, which ruled out the page itself and meant the problem had to be something specific to how the app was loading and displaying pages internally, not something visible just by looking at the page's own code.

**Learning:**
I learned that Electron (the framework the app is built with) sandboxes certain scripts by default, which can silently block them from loading code libraries they depend on, and that this kind of failure can break the entire page instead of just failing quietly on its own. I also learned that these scripts can run before the page has even finished loading, which caused a second, separate error once the first one was fixed.

**Evidence:**
Added temporary logging to the app and used a built-in screenshot function to compare the page's rendering before and after each fix. This confirmed both exact causes and showed the page rendering correctly, matching the working Chrome version, once both were fixed.

## Choosing Electron

**Choosing Electron:**
The app needed to be its own standalone window the user shops inside, rather than a browser extension, so it wouldn't be subject to an extension store's review process and policies, something outside my control that could delay or block the project for reasons unrelated to whether the code actually worked. Electron was the option that fit this: it's the same framework real desktop apps like VS Code, Slack, and Discord are built with, and it let me build a full cross-platform desktop app using the same web code (HTML/CSS/JavaScript) I already had, rather than learning a separate native language just to get a window on screen.

**How I connected my code to Electron:**
Electron splits an app into two different kinds of process that can't directly access each other: a main process with full system access, and a renderer process, which is the actual window content, deliberately sandboxed for security. My checkout logic runs in the renderer, but signing a real transaction needs the main process, so I connected the two using Electron's inter-process communication (IPC) system, defined channels that pass messages back and forth between them. A preload script sits in between, code that's allowed to run with more privilege right alongside the page itself, which is what actually calls those IPC channels when the user needs to connect a wallet or send a payment.

**What I learnt:**
I learnt that Electron sandboxes preload scripts by default, meaning they can't load external code libraries unless that's explicitly turned off, which caused a real bug where my preload script failed to load at all with no obvious error. I also learnt to keep IPC channels scoped narrowly to what each window actually needs, for example, the settings window can only ask for settings data, not trigger a wallet payment, so a mistake or bug in one part of the app can't accidentally reach into a more sensitive part of it.

**Sources:**
- [electronjs.org](https://www.electronjs.org) - what Electron is and why it's used for real desktop apps.
- [electronjs.org/docs/latest/tutorial/ipc](https://www.electronjs.org/docs/latest/tutorial/ipc) - how the main and renderer processes actually communicate.
- [electronjs.org/docs/latest/tutorial/tutorial-preload](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload) - preload scripts, the piece that let me bridge privileged code into the page safely.

## Connecting

**What happened:**
Before writing any real code, I created a repository on GitHub to store the project, then connected it to a folder on my own computer using git, with VS Code as the editor I actually work in. This meant every change I made locally in VS Code could be saved as its own commit with a message explaining what changed and why, then pushed up to GitHub, rather than just having a folder of files with no record of how the project actually got built.

**Evidence:**
The repository's own commit history is the evidence. The project has 20 separate commits at this point, each with a clear message describing exactly what was built or fixed, for example:
- "Fix Electron BrowserView render bugs; add merchant compatibility check and settings"
- "Replace universal Visa card with per-retailer gift cards; Atlus app becomes a retailer directory"
- "Reuse WalletConnect sessions instead of re-pairing on every payment; add a real installer build"

That history is a real, checkable record of the project's actual development, not something written up after the fact.

## Privacy

**What I did:**
I deliberately designed the app so that it never asks for, or has access to, more information than it actually needs. There's no sign-up, no password, and no stored identity, the only thing the app ever learns about a person is their public wallet address, and only when they're actually paying for something. Early on the website did have an account system (email plus a connected wallet), but I removed it once I realised it wasn't actually connected to how payments worked in the app itself, and was just collecting information for no real reason.

**Why it matters:**
A merchant a payment goes through never learns that crypto was involved at all, they just see an ordinary gift card or prepaid card being redeemed, the same as any other customer. Billing details, when a checkout form asks for them, are filled in directly on the user's own device and never pass through anything I control, so there's nothing for me to even have on file connecting someone's identity to a specific purchase.

**Example:**
If someone uses the app to pay at a store, I can see that *a* wallet address paid *an* amount at *a* store, for my own basic record keeping, but I have no name, no email, and no way to know who that wallet actually belongs to unless they tell me directly.

**Evidence:**
This is backed up by an actual Privacy Policy and a separate Anonymity page in the project, written to explain plainly and honestly where the real limits of this are, for example, that a blockchain transaction is still technically public and traceable if someone's wallet address has ever been linked to their identity elsewhere, like through an exchange that required ID. I didn't want to overstate the privacy of the app beyond what's actually true.

**Code, `web/app/api/transactions/complete/route.ts`:**
```ts
const { error: insertError } = await supabaseAdmin.from("transactions").insert({
  wallet_address: walletAddress,
  amount,
  merchant,
  card_last4: cardLast4,
});
```
This is the entire record a payment leaves behind, a wallet address, an amount, which store, and the last four digits of a card if there is one. No name, no email, nothing else, because there's genuinely nothing else being collected to store.

## Deriving stages

**What I did:**
Rather than trying to build the entire project in one go, I broke it down into stages based on what each one actually depended on. Research and deciding on an approach had to come first, since it would have been pointless to start writing code for an idea that wasn't going to work. After that, the backend (the part that actually talks to the service issuing the gift cards) had to exist before I could build a working checkout experience on top of it, since there was nothing real to test a UI against otherwise.

**How I derived them:**
I worked this out by asking, for each piece, "what does this actually need to already exist in order to work?" rather than just building whatever seemed most exciting first. For example, I couldn't sensibly design the payment screen's UI until I knew what real data the backend would actually return, so UI work came after backend work, not before.

**Example:**
The rough real order ended up being: research and compare existing approaches, build and test a real backend connection, build the actual app around that backend, then go back and refine the interface and user experience once the core function was already working and provably correct.

**Evidence:**
This order is visible directly in the project's own commit history and build log, backend and API work happening first, with UI and user-experience refinements consistently coming later, once there was something real underneath them to refine.

**Code, `web/package.json`:**
```json
"scripts": {
  "predev": "node scripts/generate-retailer-count.js",
  "dev": "next dev",
  "prebuild": "node scripts/generate-retailer-count.js",
  "build": "next build"
}
```
A small, literal example of staging: the retailer count shown on the website has to be generated from the real backend data *before* the site itself builds, not after, so `predev`/`prebuild` are set up to always run first, automatically, rather than relying on me remembering to run them myself in the right order.

## Finding and filling the checkout forms correctly

**What happened:**
A core part of the app is detecting a checkout form on a page it's never seen before, and correctly filling in the right fields once a payment is complete, without knowing in advance what that specific store's checkout page looks like.

**Issues:**
Checkout forms aren't standardised, different stores name their fields differently, and some don't even use a normal credit-card field at all, a lot of the gift cards my app buys get redeemed through a gift card or promo code field instead, not a card number field. On top of that, some checkout forms are built with frameworks like React that don't update properly if you just set a field's value directly, the form doesn't register it as a real change.

**Learning:**
I learnt to check multiple possible field patterns instead of one exact one, for example looking for a gift card field using several different likely names and attributes before giving up, so the app still works even if one specific store names things slightly differently than expected. I also learnt a specific trick for filling fields correctly on frameworks like React: you have to set the value using the browser's own native setter and then manually fire an "input" event, otherwise the page's own code doesn't notice the value ever changed.

**Example:**
If a store's gift card field is named differently than expected, the app still checks several other common patterns (like a general "promo code" field) before deciding there's genuinely nowhere to put the result, rather than just failing on the very first guess.

**Code, `desktop/inject/checkout.js`:**
```js
const GIFT_CARD_CODE_SELECTORS = [
  'input[name*="giftcard" i]',
  'input[name*="gift-card" i]',
  'input[placeholder*="gift card" i]',
  'input[name*="promo" i]',
  'input[placeholder*="promo code" i]',
  'input[name*="voucher" i]',
];

function setNativeValue(field, value) {
  const prototype = Object.getPrototypeOf(field);
  const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (nativeSetter) nativeSetter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
```
The first part is the list of guesses for finding the right field. The second part is the React fix: setting `field.value` directly doesn't trigger React's own change detection, so the value has to be set through the browser's real native setter, then an `input` event has to be fired manually so the page actually notices.

## UX

**What I did:**
I made several deliberate decisions to keep the actual experience of using the app as simple as possible, even when that meant removing things I'd already built. The clearest example is the app's home screen, originally it worked like a normal browser where you could type in any web address, but I replaced that with a simple searchable list of stores the app actually supports, since letting someone go anywhere implied the app could help them everywhere, when it can't.

**Why it matters:**
A good user experience means being honest about what the product can and can't do, not just making it look impressive. Showing a short, clear list of supported stores sets the right expectation immediately, instead of a user finding out the hard way, partway through checkout, that a store isn't supported.

**Example:**
The actual payment screen was also kept deliberately simple, it shows the amount, which currency it's being paid in, a warning about what's about to happen, and a clear two-step confirmation before any money moves, rather than burying that information or making it a single, easy-to-misclick button.

**Evidence:**
Earlier versions of the website had a lot more text and a full account sign-up flow on the homepage. I simplified this down to a single clear call to action once I realised the extra steps weren't actually connected to how someone pays in the real app, they were just extra friction with no real purpose.

**Code, `desktop/shell/shell.js`:**
```js
// No free-text URL/search bar here on purpose: Atlus isn't a general
// browser, navigation happens by picking a retailer on the home screen
// (see home/home.js) or clicking a link on the site you're already on.
// This strip is just back/forward/reload/home plus a read-only label of
// where you currently are.
```
This comment sits right at the top of the file as a reminder of the actual decision, so future changes to this file stay consistent with it instead of someone (including me) quietly adding a search bar back in later without thinking about why it was removed.

## UI: CSS, React.js learning

**What I did:**
The user interface for the website is built using React, through a framework called Next.js, with CSS handling all of the actual visual styling. Both of these were skills I actively built up over the course of this project rather than knowing beforehand.

**Learning, CSS:**
I went from only being able to make very basic elements, buttons, cards, simple padding, to understanding more deliberate layout techniques, like using flexible, gap-based spacing instead of manually setting margins on individual elements, which is more reliable and avoids spacing accidentally doubling up between elements.

**Learning, React:**
I learnt the difference between a component that just displays information and one that needs to track changing information over time, called state, for example, whether a search box's text has changed and the list on screen needs to update to match it. I also learnt about the difference between code that runs once when a page is first generated versus code that needs to run again every time something changes while someone's actually using the page.

**Example:**
A concrete example is the homepage's retailer search: typing into the search box updates a piece of state, and the page automatically re-filters and re-displays the list of stores to match, without me having to manually find and rewrite the list on screen myself every time.

**Code, CSS, `desktop/home/index.html`:**
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
```
This is the layout technique I mean, `gap` handles all the spacing between every card in the grid at once, evenly, instead of me manually adding a margin to every single card and having to account for it being doubled up wherever two cards sit next to each other.

**Code, React, `web/components/LegalLayout.tsx`:**
```tsx
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-neutral-600">
        {children}
      </div>
    </section>
  );
}
```
A reusable component: this one shape gets reused across all four of the site's legal pages, each one just passes in its own `title` and content as `children`, instead of me copy-pasting the same heading and spacing markup onto every single page by hand.

## Coordination

**What I did:**
Rather than having the app talk directly to the outside service that issues gift cards, I built a separate small backend service in between, acting as a coordinator. The app talks to this coordinator, and the coordinator is the only part of the whole system that actually talks to the real outside API.

**Why it matters:**
This meant sensitive information, like the private key needed to authenticate with that outside API, never has to exist inside the app itself, which could end up on anyone's computer. It also meant I could put real safety limits in one central place, like a hard cap on how much a single payment is allowed to be for, enforced before a request is even sent to the real service, rather than trusting every part of the app to individually enforce that correctly.

**Example:**
When the app wants to create a payment, it sends a simple request to the coordinator with just the amount and which store it's for. The coordinator is the one that actually knows the real pricing, builds the real request to the outside API, and checks it against the spending limit, the app itself never sees or handles any of those sensitive details directly.

**Evidence:**
This separation is visible directly in the project's folder structure, the coordinator is its own separate piece of code with its own environment file holding the real credentials, completely separate from the app the user actually runs on their computer.

**Code, `coordinator/server.js`:**
```js
const MAX_SPEND_USD = Number(process.env.MAX_SPEND_USD || 20);

if (Number(amountFiat) > MAX_SPEND_USD) {
  return res.status(400).json({
    error: `amountFiat exceeds the configured spend cap (${MAX_SPEND_USD}).`,
  });
}
```
This is the actual safety limit, enforced in exactly one place. Because every payment has to go through this coordinator, I only ever had to write this check once for it to apply everywhere, instead of needing to trust every other part of the app to separately remember to check it too.

## Things I have done that have personal value

**What happened:**
Beyond just completing the assignment, this project became something I actually cared about getting right, to the point of treating it like a real product rather than a school exercise. I made a deliberate decision partway through to stop treating any part of it as a simulation or a placeholder, since it genuinely does move real money, and that changed how carefully I approached every decision after that.

**Why it had personal value:**
Building something that actually works, end to end, with real consequences if it's wrong, taught me a kind of carefulness I don't think a purely hypothetical project would have. Catching my own incorrect assumptions before they became real problems, rather than after, was genuinely satisfying in a way that's hard to get from a project where nothing real is actually at stake.

**Example:**
A specific moment that stuck with me was realising a planned approach wouldn't actually work before building any code around it, and having to go find a better one, rather than finding out the hard way after already committing to it. Being willing to change direction when the evidence said I was wrong, instead of pushing forward anyway, is something I'm genuinely proud of about how I approached this.

**Evidence:**
The project's own build log records these moments honestly as they happened, including the times something didn't work and had to be rethought, not just the parts that went smoothly. That record is itself something I value, since it's an accurate picture of how the project actually came together, not a cleaned-up version after the fact.

**Code, `desktop/inject/checkout.js`:**
```js
// No auto-submit either way, same reasoning as the extension: real money
// was just spent, final submission stays a manual, visible click.
function fillRedemption(target, redemption) {
```
This one comment is the clearest example of that carefulness to me. It would've been easy to make the form submit itself automatically once a payment succeeded, it's a small convenience. I deliberately didn't, specifically because real money had just moved, and the very last step should always stay something the person can see and consciously choose to do themselves.
