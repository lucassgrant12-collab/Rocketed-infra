# Build Log

Chronological engineering journal: what was done, in what order, and why. This is the "what happened" record - deeper reasoning and open tradeoffs live in [RESEARCH.md](RESEARCH.md); presentation-ready material lives in [SLIDES.md](SLIDES.md).

Convention: one entry per work session, newest at the bottom, dated. Log decisions and direction changes, not just file diffs - git history already has the diffs.

---

## 2026-07-29 - Project pivot: Atlus Pay

- Previous project direction (DeFi coverage protocol: attestation + tranched risk pool + watcher verification) was scrapped by the user before any code was written. Its docs were deleted.
- New project defined: **Atlus Pay** - a non-custodial, privacy-preserving crypto payment system ("pay for anything online with any crypto, as easy as Apple Pay"). Three components: User Vault, Payer Node Network, Atlus Protocol Core. Full system debrief logged in [RESEARCH.md](RESEARCH.md#2026-07-29---system-debrief-atlus-pay).
- Documentation workflow recreated for the new project: this file, `RESEARCH.md`, `SLIDES.md`.
- Design decision: **onboarding is username entry + wallet connect**, no separate KYC/identity step at v1. **Payment confirmation is sent by email**, not push notification (overrides the push-notification mention in the original system debrief).
- User states core tech (double-entry ledger, non-custodial vault w/ Shamir guardian recovery, RSA blind signature module, Payer Node adapter pattern) is already built elsewhere - not yet present in this repo. Needs to be located/imported before implementation work starts on top of it.
- No code written yet in this repo. Next step: locate/import existing tech stack pieces, then decide build order.

## 2026-07-29 - Rebrand to Atlus + Treasury Model pivot (v1)

- Project renamed from "Atlas Pay" to "Atlus Pay" throughout all docs.
- v1 architecture revised: Atlus itself acts as the sole payer node (the "Treasury Model") - converts user crypto to USDT, takes a fee spread, pays merchants directly via a Stripe Issuing sandbox virtual card, retains the USDT as profit, off-ramps later. The independent Payer Node Network is now a v2/future scaling step, not a v1 requirement. Full detail and the non-custodial-claim tension this introduces are logged in [RESEARCH.md](RESEARCH.md#2026-07-29---pivot-atlus-treasury-model-v1).
- Fiat rails are simulated (Stripe Issuing sandbox) during development - no real money moves yet, but that's a dev-stage choice, not a scope limit. See the 2026-07-29 "Reframe" entry below.
- Starting implementation: website onboarding (email capture + wallet connect), a `.env` for secrets, and Supabase SQL migrations for the onboarding data. Onboarding is now email capture + wallet connect (supersedes the earlier "username + wallet connect" decision - email doubles as the capture field and the confirmation channel).

## 2026-07-29 - Onboarding v1 built: email capture + wallet connect

- Scaffolded `web/` - Next.js (App Router, TypeScript, Tailwind), via `create-next-app`.
- Installed `wagmi` + `viem` + `@rainbow-me/rainbowkit` + `@tanstack/react-query` for wallet connect, `@supabase/supabase-js` for the backend.
- [web/lib/wagmi.ts](web/lib/wagmi.ts) - wagmi config via RainbowKit's `getDefaultConfig`, targeting Sepolia testnet (current dev-stage network, not a permanent no-real-funds constraint).
- [web/app/providers.tsx](web/app/providers.tsx) - wraps the app in `WagmiProvider` / `QueryClientProvider` / `RainbowKitProvider`; wired into [web/app/layout.tsx](web/app/layout.tsx).
- [web/app/page.tsx](web/app/page.tsx) - the onboarding flow: email field with basic format validation → RainbowKit `ConnectButton` → on connect, upserts `{ email, wallet_address }` into Supabase keyed on `wallet_address`, with saving/saved/error states shown inline.
- [web/lib/supabaseClient.ts](web/lib/supabaseClient.ts) - Supabase client reading `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [supabase/001_users.sql](supabase/001_users.sql) - `public.users` table (`id`, `email`, `wallet_address` unique, `created_at`), RLS enabled with insert/update policies for the `anon` role and no select policy, so the anon key can write onboarding rows but can't read anyone else's email/wallet back out.
- `web/.env.example` (committed) and `web/.env.local` (gitignored) - both list `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Values are blank; fill in `.env.local` with real project credentials.

### Two build issues hit and fixed (see SLIDES.md for the slide version of this)

1. **RainbowKit's `getDefaultConfig` throws at build time if `projectId` is empty** - `next build` failed prerendering `/_not-found` with "No projectId found" even though the app doesn't touch WalletConnect at that point. Fixed by falling back to a placeholder string (`atlus-pay-placeholder-project-id`) when the env var is unset - real WalletConnect connections won't work until a real project ID from cloud.reown.com is set, but the build/dev server no longer hard-fails without one.
2. **Supabase client was throwing at module import time** when env vars were missing, which runs during Next.js prerendering and would have broken `next build` before `.env.local` is ever filled in. Fixed by falling back to placeholder URL/key and `console.warn` instead of throwing - a real Supabase call will fail at request time and surface through the existing error state in `page.tsx`, instead of crashing the build.

### Verified

- `npm run build` succeeds.
- `npm run dev` serves the page; confirmed via curl that the rendered HTML contains the title, email input, and Continue button, no error boundary triggered.

### Still open before this is real

- `web/.env.local` needs actual Supabase project URL/anon key and a WalletConnect Cloud project ID - onboarding won't actually persist to Supabase or support WalletConnect-based wallets until then.
- `supabase/001_users.sql` needs to be run against the actual Supabase project (SQL editor or CLI) before the app's upsert will succeed.

## 2026-07-29 - Phantom wallet added; connect flow verified end-to-end

### How wallet connect actually works

[web/lib/wagmi.ts](web/lib/wagmi.ts) switched from RainbowKit's `getDefaultConfig` (a fixed default wallet set) to explicit `connectorsForWallets`, listing `metaMaskWallet`, `phantomWallet`, `rainbowWallet`, `coinbaseWallet`, `walletConnectWallet`. The first four detect the wallet's browser extension directly (e.g. Phantom's connector looks for `window.phantom.ethereum`) and connect via a standard EIP-1193 `request({ method: "eth_requestAccounts" })` call - no WalletConnect project ID involved. Only the `walletConnectWallet` option (for wallets without a matching browser extension, e.g. scanning a QR code with a mobile wallet) actually needs the real project ID from cloud.reown.com; until `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, that one specific option won't work, but it no longer breaks the build (see the placeholder-projectId fix from the previous entry) and the other four wallets are unaffected.

Once a wallet connects, `useAccount()` in [web/app/page.tsx](web/app/page.tsx) picks up the address, which triggers the existing onboarding-save effect. Reconnection is automatic on future visits - wagmi silently calls `eth_accounts` on mount, and if the wallet already authorized this site, the user lands back in a connected state without re-clicking anything.

### Verification method

No real browser wallet extension is available in this dev environment, so verified with a Playwright script that injects a mock EIP-1193 provider at `window.phantom.ethereum` (same shape a real Phantom extension exposes) before the page loads, then drives the actual UI: fills the email field, clicks Continue, opens the connect modal, clicks Phantom, and asserts the connected state renders.

- Confirmed the modal lists all 5 configured wallets: MetaMask, Phantom, Rainbow, Coinbase Wallet, WalletConnect.
- First mock attempt had `eth_accounts` always return an address, which caused wagmi to silently auto-reconnect before the modal was ever opened - a real finding about existing behavior (persistent connection across reloads works), not a bug, but it meant the test wasn't exercising the manual click-to-connect path. Fixed the mock to only return an address from `eth_requestAccounts` (i.e. only after an explicit connect), matching how a real un-authorized wallet behaves.
- With that fix, the full flow completed: address `0x12…7890` rendered in the RainbowKit account button after clicking Phantom in the modal, and the onboarding-save effect fired immediately after, failing with a visible "TypeError: Failed to fetch" - expected, since `.env.local` still points at a placeholder Supabase URL. Confirms the error-handling path (Slide 10 / the earlier "don't throw at import time" fix) degrades gracefully instead of crashing.

Same underlying `injected()` wagmi connector path is used for MetaMask, Rainbow, and Coinbase Wallet's browser-extension mode, so this test covers their connection mechanics too - only WalletConnect's QR path is untested here (needs a real project ID and an actual mobile wallet to test meaningfully).

## 2026-07-29 - Landing page design pass

- Extracted the stateful onboarding logic (email step + wallet connect + Supabase save) out of `app/page.tsx` into [web/components/OnboardingCard.tsx](web/components/OnboardingCard.tsx), styled as a white/dark card (rounded-2xl, soft shadow, ring) matching the polish of RainbowKit's own connect modal - same visual language, since that's the one piece of UI on the page already proven to look right.
- `app/page.tsx` is now the marketing shell around that card: header with wordmark + a "Sepolia Testnet" badge (current network, not a claim about the project's ambitions), a two-column hero on desktop (headline/subtext/3-step "how it works" list next to the card, stacking to one column on mobile).
- Fixed a pre-existing bug in [web/app/globals.css](web/app/globals.css): `body` hardcoded `font-family: Arial`, silently overriding the Geist font that's loaded via `next/font` and exposed as `--font-sans` - the custom font was never actually rendering. Now reads `var(--font-sans)` first.
- Verified: `npm run build` passes; screenshotted the page in light, dark, and mobile viewports via Playwright - all render correctly, card and hero both responsive. Re-ran the mock-wallet Playwright test from the previous entry against the new layout to confirm the connect flow still works unchanged after the restructure (it does - same `id="email"` and button text, so the DOM contract didn't shift).

## 2026-07-29 - Reframe: this is a real project, not a school demo

- The footer originally shipped with the design pass read "Atlus Pay - a Year 11 AIF project. Testnet only, no real funds." - user corrected this directly: Atlus Pay is a serious, real project intended to eventually move real funds; the Year 11 AIF submission rides on top of it, it isn't the point of it. Footer line removed from [web/app/page.tsx](web/app/page.tsx) entirely rather than reworded, since there was nothing else worth putting there.
- Same framing corrected in [RESEARCH.md](RESEARCH.md#2026-07-29---pivot-atlus-treasury-model-v1) and earlier entries in this file: "simulated fiat rails / testnet" is accurately described as the **current development stage** (sandboxes are what you use before real money is on the line, not a permanent ceiling on scope), not as "this is just a school assignment so it doesn't need to be real."
- Practical effect on future work: don't undersell scope or add disclaimers implying this won't handle real funds - money transmission, custody, and the regulatory risk map in RESEARCH.md's Risks section are live concerns for an eventual real deployment, not hypotheticals for an assignment writeup. The Sepolia-testnet / Stripe-sandbox choices stay as-is for now (still the right dev-stage tools), just without a copy line editorializing them as the endpoint.

## 2026-07-29 - Browser extension built: checkout via extension, not merchant snippet

Checkout moves from "merchant embeds a JS snippet" to "user installs a Chrome extension that detects any checkout form itself." Full reasoning in [RESEARCH.md](RESEARCH.md#2026-07-29---pivot-checkout-moves-from-a-merchant-js-snippet-to-a-browser-extension).

### Built - `extension/` (Manifest V3)

- [manifest.json](extension/manifest.json) - `activeTab`, `scripting`, `storage` permissions; `host_permissions: ["<all_urls>"]`; two content scripts - `content.js` on `<all_urls>` (checkout detection) and `wallet-bridge.js` scoped to `http://localhost:3000/*` only (the Atlus site itself, update once there's a production domain).
- [content.js](extension/content.js) - scans for card-number fields via a list of `autocomplete`/`name`/`id` patterns, injects the "Pay with Atlus" button beside the first match, and keeps a `MutationObserver` running for SPA checkouts that render the form after initial load. Fills card fields through the page framework's native setter (not a plain `.value =`) so React/Vue-controlled inputs actually pick up the change.
- [background.js](extension/background.js) - service worker message hub. `initiatePayment` (from content.js) opens a centered `chrome.windows.create` popup; `confirmPayment` (from popup.js) drives the two-step coordinator call - `POST /api/pay` (returns `orderId`/`secret`), a 200ms simulated settlement delay, then `POST /api/reveal` (returns the virtual card) - and relays the result to the originating tab as a `fillCard` message and to the popup as `paymentSucceeded`/`paymentFailed`. Payment state is transaction-scoped and kept in memory; the wallet address is the one thing persisted to `chrome.storage.local`, since it needs to outlive any single payment and survive service-worker restarts.
- [popup.html](extension/popup.html) / [popup.js](extension/popup.js) - standalone confirm/cancel window (not the toolbar default popup), shows the detected amount or a manual-entry fallback if detection failed.
- [wallet-bridge.js](extension/wallet-bridge.js) - new piece, not in the original spec: relays the connected wallet address from the website into the extension.
- [test/checkout.html](extension/test/checkout.html) - dummy checkout page (card number/expiry/CVV fields with correct `autocomplete` attributes, a `.order-total` total) for manual and automated testing.
- [README.md](extension/README.md) - dev-mode load steps and how to test against the dummy checkout page, as requested.

### Website changes - wallet sync + install path

- [web/components/WalletBridge.tsx](web/components/WalletBridge.tsx) - mounted once in `app/providers.tsx`, watches `useAccount()` and `window.postMessage`s `WALLET_CONNECTED`/`WALLET_DISCONNECTED` to `wallet-bridge.js` whenever connection state changes, site-wide (not scoped to the onboarding card's lifecycle).
- [web/components/GetExtensionCard.tsx](web/components/GetExtensionCard.tsx) - a "Get Extension" button that expands into numbered install steps and a link to the `extension/` folder on GitHub. No Chrome Web Store listing exists yet, so this links to the real repo folder rather than a fabricated store URL - says so explicitly in the UI. Stacked below the onboarding card in `app/page.tsx`.

### Verification

No real coordinator exists yet (the spec explicitly says not to build one), so verified with a temporary mock coordinator (plain Node `http` server, not committed - implements `/api/pay`/`/api/reveal` exactly as specified) and Playwright's `launchPersistentContext` with `--load-extension` pointed at `extension/`, driving the real extension against `test/checkout.html`: button injection → click → popup opens showing the detected `$49.99` → Confirm → coordinator round trip → card fields (`4242424242424242`, `12/29`, `123`) filled on the checkout page. Confirmed end-to-end on 4 separate runs.

**One real bug surfaced and investigated, not just brushed past:** the very first run ever (this extension's first-ever registration in a fresh Chrome install on this machine) showed *two* `/api/pay` calls for one click - one with the correct body, one missing `merchant`/`walletAddress` entirely. Added temporary instrumentation (a random per-load service-worker instance ID logged on every message) and reran with a wiped profile three more times: every subsequent run showed exactly one `/api/pay` + one `/api/reveal`, both tagged with the same single service-worker instance ID. Conclusion: a one-off Chrome extension first-install lifecycle quirk (not uncommon - the very first activation of a never-before-seen extension ID can double-fire lifecycle events), not a bug in the message-passing logic itself. Debug instrumentation removed before shipping.

### Still open before this is real

- No real coordinator - `background.js` points at `http://localhost:3000/api/pay` / `/api/reveal`, currently unimplemented outside the throwaway test mock.
- `wallet-bridge.js`'s content script match pattern is hardcoded to `http://localhost:3000/*` - needs updating once the site has a production domain.
- Not published to the Chrome Web Store - the "Get Extension" install steps (now step 3 of onboarding, see the next entry) are for developer-mode "Load unpacked" only.

## 2026-07-29 - Onboarding restructure, transaction emails, legal pages, copy cleanup

Several requests landed together this session; grouping them into one entry since they touched overlapping files.

### Emails weren't storing, and why

Checked [web/.env.local](web/.env.local): every value was still blank. That's the entire explanation, not a code bug. The upsert logic and RLS policies were already verified correct earlier (the clean "TypeError: Failed to fetch" failure against the placeholder Supabase URL, logged in the 2026-07-29 Phantom wallet entry above, is exactly the failure mode an unreachable placeholder host produces). Nothing to fix in code; `web/.env.local` still needs a real Supabase URL, anon key, and now also a service role key (see below) before anything persists.

### Onboarding restructured to three steps

[web/components/OnboardingCard.tsx](web/components/OnboardingCard.tsx) now derives its step from state instead of storing it: `const step = !emailConfirmed ? 1 : !isConnected ? 2 : 3`. Step 3 ("Get the extension") only renders once a wallet is connected, per the explicit request to make that the step after connecting a wallet. The standalone `GetExtensionCard` component was deleted; its install instructions moved into step 3 of this component instead of living as a separate, always-visible card.

### Homepage copy updated to match the extension-based flow

[web/app/page.tsx](web/app/page.tsx)'s hero and three-step list previously described the old "check out like normal" framing from before the extension pivot. Now reads: connect wallet, install the extension, pay in one click. The steps match what the product actually does today, not what the original merchant-snippet design described.

### Transaction recording and automated confirmation emails

New table [supabase/002_transactions.sql](supabase/002_transactions.sql) (`wallet_address`, `merchant`, `amount`, `card_last4`), RLS enabled with no policies granted at all, since this table is only ever touched server-side with the service role key, never by the anon key or the extension directly.

- [web/lib/supabaseAdmin.ts](web/lib/supabaseAdmin.ts) - service-role Supabase client, server-only, bypasses RLS. Needed because looking up a user's email by wallet address (to send a receipt) is exactly the kind of cross-user read the anon key is deliberately not allowed to do.
- [web/lib/resend.ts](web/lib/resend.ts) - Resend client for sending the actual email.
- [web/app/api/transactions/complete/route.ts](web/app/api/transactions/complete/route.ts) - inserts the transaction row, looks up the paying wallet's email, sends an HTML confirmation summary if one exists. User-supplied text (the popup's manual amount fallback) is HTML-escaped before going into the email body, since that field is free text a user can type anything into.
- [extension/background.js](extension/background.js) - after `notifyPopup({ action: "paymentSucceeded" })`, fires a non-blocking `notifyWebsiteOfTransaction(...)` call at this new endpoint. Deliberately fire-and-forget: the payment already succeeded from the user's perspective once the card is filled, so a failed email shouldn't retroactively look like a failed payment.

New env vars in `.env.example`/`.env.local`: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

**Same build-time crash pattern as before, caught before it shipped:** the Resend SDK throws synchronously at construction if the API key is missing, which runs during `next build`'s page-data collection, same failure mode as the RainbowKit `projectId` and Supabase client issues from earlier entries. Same fix: fall back to a placeholder key, defer the real failure to the actual `.emails.send()` call.

**Unresolved quirk, noted honestly rather than papered over:** curled the route directly against the placeholder Supabase URL expecting a clean `{ error: insertError.message }` response. Got Next.js's own generic `{"error":"TypeError: fetch failed"}` instead. Wrapped the whole handler body in try/catch and added a temporary diagnostic log inside the catch block; the log never printed, across a full dev server restart and a cleared `.next` cache, which means the failure is happening somewhere Next.js's own fetch instrumentation intercepts before it ever reaches the route's try/catch, not a bug in the route logic itself. The server stays up and keeps serving other requests fine either way, and this specific failure mode only exists because of the placeholder credentials. Once real Supabase/Resend keys are in `.env.local`, this code path never runs. Left the try/catch in place since it is still correct defensive practice, just noting it doesn't currently explain this particular error message.

### Legal pages and shared site chrome

Extracted `Header` and `Footer` into [web/components/Header.tsx](web/components/Header.tsx) / [web/components/Footer.tsx](web/components/Footer.tsx), mounted once in [web/app/layout.tsx](web/app/layout.tsx) instead of living inside `page.tsx`, so every page gets consistent navigation. Added three real pages, not placeholders:

- [web/app/terms/page.tsx](web/app/terms/page.tsx) - Terms of Service.
- [web/app/privacy/page.tsx](web/app/privacy/page.tsx) - Privacy Policy, describing exactly what's collected (email, wallet address, transaction records) and what deliberately isn't (shipping/billing details, private keys).
- [web/app/disclosures/page.tsx](web/app/disclosures/page.tsx) - the external services list (Supabase, Resend, Reown/WalletConnect, wagmi/viem, Sepolia, Stripe Issuing sandbox) plus crypto-specific risk disclosures (volatility, non-custodial responsibility, no deposit insurance, unaudited software, undetermined regulatory status).

Governing law/jurisdiction in the Terms page is left as an explicit open item rather than a fabricated answer, since that's a real decision that needs actual counsel, not something to guess at.

### Dash cleanup

Removed all em dashes across every doc and source file (docs and code comments now use plain hyphens where a break is still needed). Went further on the website's own user-facing copy specifically, per a follow-up request: no dash punctuation at all there, sentences were rephrased into two sentences instead. Extension UI text and code comments keep plain hyphens.

Fixing the em dashes in markdown headings had a side effect worth noting: GitHub's anchor-slug algorithm produces a different slug when a heading's em dash becomes a plain hyphen (double hyphen becomes triple hyphen, since the literal hyphen plus its two surrounding spaces all convert). Every internal `RESEARCH.md#...` cross-link in this file had to be updated to match, including one that turned out to already be stale from the earlier Atlas to Atlus rename (its anchor still said `atlas-pay`).

### Verified

- `npm run build` passes with all new routes registered (`/terms`, `/privacy`, `/disclosures`, `/api/transactions/complete`).
- Screenshotted the homepage (with footer) and both `/terms` and `/disclosures` to confirm the shared layout renders correctly in the browser, not just compiles.

### Slide format convention (reference)

Each slide in `SLIDES.md` follows this structure (mirrors the reference screenshot the user provided):

```
## Slide N - "quotable title"

**Talking points**
- ...

**Code piece 1 - [what it is]**
```lang
...
```

**Code piece 2 - [what it is, e.g. the piece that didn't work / the connecting piece]**
```lang
...
```

**How they connect:** prose explaining how piece 1 and piece 2 relate, and if applicable, what changed between a broken first attempt and the working version.
```

When something breaks during implementation and gets fixed, capture *both* versions on the slide (broken → what changed → working), not just the final code - that contrast is the point of the deck.
