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

## 2026-07-29 - Emails actually storing now: the real root cause

User filled in `.env.local` with real Supabase credentials. Onboarding still failed, but the error changed each time credentials/config changed, which made this a genuine multi-step diagnosis rather than a single fix. Recorded in full since the eventual root cause is a real, easy-to-hit Postgres/Supabase gotcha, not an app bug.

1. **Wrong value shape.** `NEXT_PUBLIC_SUPABASE_URL` was set to just the project ref (`hkbyfpzsldpxtlmtglpx`) instead of the full URL. Fixed to `https://hkbyfpzsldpxtlmtglpx.supabase.co`. This alone fixed the "TypeError: Failed to fetch" (unreachable placeholder host) and the app started actually reaching Supabase.
2. **RLS policies existed but weren't granted table access.** Once reachable, every insert failed with `42501 new row violates row-level security policy`. `select policyname, cmd, roles from pg_policies where tablename = 'users'` confirmed both policies from `supabase/001_users.sql` existed correctly. The actual gap: a table created via the SQL Editor doesn't automatically get base table-level `GRANT`s for the `anon` role the way a table created through Supabase's Table Editor UI does. RLS policies control which *rows* are visible; the table-level grant controls whether the role can touch the table at all. Fixed by adding `grant usage on schema public to anon; grant insert, update on public.users to anon;` to [supabase/001_users.sql](supabase/001_users.sql) itself, not just running it ad hoc, so a fresh project setup gets it automatically.
3. **Still failing after the grant, which ruled out the grant as the (sole) cause.** `set role anon; insert into public.users (...) values (...);` run directly in the SQL Editor **succeeded**, proving the Postgres-level policy and grant setup was fully correct. Yet the same insert via the REST API with the anon key still failed identically. That gap, "works via direct SQL, fails via the API, using the same role," pointed at something specific to how PostgREST processes the request, not the underlying permissions.
4. **The actual cause: `.upsert()`'s `ON CONFLICT DO UPDATE` needs a SELECT policy, even with zero existing rows.** Captured the real network request the app was sending (Playwright's `page.on("request")`) and found the `Prefer: resolution=merge-duplicates` header, i.e. `.upsert({...}, { onConflict: "wallet_address" })` compiles to `INSERT ... ON CONFLICT (wallet_address) DO UPDATE`. Postgres requires a SELECT policy to resolve that clause under RLS, structurally, regardless of whether a conflicting row actually exists yet. There was deliberately no SELECT policy on `users` (anon can write an onboarding row but was never meant to be able to read anyone else's email or wallet back, see [supabase/001_users.sql](supabase/001_users.sql)'s original design note). Confirmed via curl: the exact same row insert with the `Prefer: return=representation` header removed, and without `on_conflict`, succeeded with a clean `201`.
5. **Fix: stop using `.upsert()`.** [web/components/OnboardingCard.tsx](web/components/OnboardingCard.tsx) now does a plain `.insert()`, and only on a `23505` (unique violation on `wallet_address`) falls back to a plain `.update().eq("wallet_address", address)`. Both of those only need the INSERT and UPDATE policies that already existed, no SELECT policy required, so the "can't read other users' data" privacy property stays intact. Verified both paths directly against the real project: first insert returns `201`, a repeat with the same wallet address returns `409` from the insert then `204` from the follow-up update.

Adding a permissive SELECT policy would have been the one-line fix, but it would have meant anyone holding the public anon key (which ships in the client bundle, it's meant to be public) could read every onboarded user's email and wallet address in one request. Not worth trading away for convenience.

### Verified

- Full onboarding flow retested end to end against the real Supabase project (not a placeholder): email, connect wallet, "You're onboarded. Confirmation sent to \[email\]." actually renders.
- Cleaned up the five test rows (`sql-test@`, `service-role-test@`, `no-representation-test@`, `network-test@`, `test@example.com`) created on the live project while diagnosing this, using the service role key.

## 2026-07-30 - Stripe Issuing dropped, Bitrefill mock coordinator built

Stripe Issuing is out. Card issuing now routes through Bitrefill instead, an existing crypto prepaid card vendor, so Atlus is a client of a card program rather than becoming a card issuer itself. No live Bitrefill account exists yet, so a real, standalone mock coordinator was built to the shape Bitrefill's actual API uses. Full reasoning in [RESEARCH.md](RESEARCH.md#2026-07-29---pivot-bitrefill-replaces-stripe-issuing-as-the-card-issuing-plan).

### Built - `coordinator/` (new top-level service)

- [coordinator/server.js](coordinator/server.js) - a standalone Express server, not part of the Next.js website, listening on its own port (3001) so it can run alongside the website (3000) without a port conflict. That conflict was a real annoyance in earlier testing rounds, this removes it going forward.
- Mocks Bitrefill's own API shape (`POST /api/bitrefill/invoice`, `GET /api/bitrefill/invoice/:id`) using an in-memory `Map`, plus a `POST /api/bitrefill/simulate-payment` that isn't a real Bitrefill endpoint, it stands in for "the wallet's crypto payment actually settled" until real payment detection exists.
- Exposes two convenience endpoints, `POST /api/atlus/create-payment` and `POST /api/atlus/complete-payment`, which are the *only* ones the extension talks to. That indirection is deliberate: replacing the mock with a real Bitrefill account later only changes what's inside the `/api/bitrefill/*` handlers, never the extension.
- Mock card details are Stripe's well-known `4242 4242 4242 4242` test number, obviously fake, never real.

### Extension updated to match

[extension/background.js](extension/background.js)'s `handleConfirmPayment` now calls `create-payment` then `complete-payment` against `http://localhost:3001` instead of the old ad hoc `/api/pay`/`/api/reveal` hashlock endpoints on port 3000. `WEBSITE_URL` (for recording transactions and sending confirmation emails) stays pointed at the Next.js site on port 3000, so the two servers now run side by side rather than sharing one origin.

### A real bug found while testing this, not the coordinator's fault

Running the extension against the real coordinator (not a throwaway test script this time) surfaced a genuine app bug: `web/app/api/transactions/complete/route.ts` required `walletAddress` to be present, and rejected `null` as "missing" with a 400. But `null` is exactly what the extension correctly sends when no wallet was ever connected through the website, meaning every extension-only payment (no prior onboarding) silently failed to record at all, and the extension's fire-and-forget fetch call swallowed the failure without even logging it, since a 400 response doesn't reject a `fetch()` promise.

This contradicted the feature's own stated design ("a transaction still gets recorded even if this wallet has no onboarded email"), it just hadn't been tested against a real "no wallet" case before now. Fixed by making `walletAddress` genuinely optional end to end:

- [supabase/002_transactions.sql](supabase/002_transactions.sql): `wallet_address` changed from `not null` to nullable, plus an explicit `alter table ... drop not null` since the table already existed on the live project with the old constraint (`create table if not exists` doesn't retroactively change an existing column).
- [route.ts](web/app/api/transactions/complete/route.ts): validation now only requires `amount`. A missing wallet address still records the transaction, just skips the email lookup instead of rejecting the whole request.

### Verified

- Coordinator endpoints tested directly with curl: `create-payment` returns a correctly fee-adjusted `amountCrypto` (5% markup, e.g. $49.99 to $52.49), `complete-payment` returns the mock card.
- Full extension flow retested against the real coordinator (not a mock server written just for the test, `coordinator/server.js` itself, running for real): button, popup, both coordinator calls, card autofill (`4242424242424242`, `12/30`, `123`), all correct.
- Confirmed the transaction-recording bug by testing the actual failure case (`walletAddress: null`) directly against the live route before assuming the fix worked, then re-verified after applying it: `{"stored":true,"emailed":false}`. Reran the full extension flow afterward and confirmed the row actually landed in the live `transactions` table, not just that the endpoint returned success.
- Cleaned up the test rows this created.

## 2026-07-30 - Real Bitrefill integration, full-page overlay, mainnet payments

A large spec arrived asking for "the real Bitrefill sandbox," no mocks. Before writing code against it, checked its claims against Bitrefill's actual published API docs, and the spec's endpoints, base URL, and "sandbox" concept turned out not to exist. Full research trail in [RESEARCH.md](RESEARCH.md#2026-07-30---real-bitrefill-integration-the-spec-didnt-match-the-real-api-and-the-payment-leg-moves-to-mainnet). Confirmed with the project owner before writing any wallet-sending code that this means real Ethereum mainnet ETH, not testnet, since Bitrefill has no free path to test against at all.

### Built

- [coordinator/server.js](coordinator/server.js) - rewritten against Bitrefill's real, verified endpoints (`/v2/invoices`, `/v2/invoices/:id`, `/orders/:id`, `/products/search`). No mock fallback: missing `BITREFILL_API_KEY` or `BITREFILL_VISA_PRODUCT_ID` fails clearly instead of returning fake data. Enforces `MAX_SPEND_USD` (default $20) before any request reaches Bitrefill.
- [extension/injected.js](extension/injected.js) - new. A real `<script>` tag content.js injects into the page's own JS world, the only place `window.ethereum` is reliably reachable from a Manifest V3 content script, which runs in an isolated world that doesn't share arbitrary window properties with the page.
- [extension/content.js](extension/content.js) - rewritten around a full-page overlay (replacing the old small `chrome.windows.create` popup, `popup.html`/`popup.js` deleted) that drives the whole flow: wallet connect, mainnet chain switch, balance display, a real transaction send, waiting on the coordinator, then filling the card. Deliberately does not auto-submit the merchant's form afterward, given real crypto was just spent to get the card.
- [extension/background.js](extension/background.js) - simplified to a thin relay (`createPayment`, `pollUntilPaid`, `recordTransaction`) now that content.js owns the orchestration instead of the service worker.
- No `ethers.js` bundled, on purpose: a handful of directly readable EIP-1193 calls plus one explicit BigInt decimal-to-wei conversion felt more auditable for code that moves real funds than a vendored third-party bundle. See `ethToWeiHex`/`weiHexToEthDisplay` in content.js.

### A real bug caught before it shipped

First overlay test run hung indefinitely on wallet connect. Root cause: `injectPageBridge()` appended the `<script>` tag and returned immediately, but loading and executing `injected.js` is asynchronous, so the first `callWallet()` postMessage could be sent before `injected.js`'s listener was registered to receive it, and postMessage doesn't queue for a listener that isn't there yet. Fixed by making `injectPageBridge()` return a promise that resolves on the script's `load` event, and awaiting it before the first wallet call. Confirmed the fix by rerunning the same test, which then completed the full wallet-connect sequence correctly.

### Verified

Everything short of an actual real-money transaction, since that requires real Bitrefill credentials and a funded wallet neither exist yet:

- Full overlay flow against a mocked mainnet wallet (Playwright, same technique used earlier for wallet-connect testing): button click, overlay appears, `eth_requestAccounts` and `eth_getBalance` both round-trip correctly through the injected-script bridge, balance and detected amount both render correctly in the UI.
- Both real coordinator error paths, exercised through the full UI (not just curl): the `$20` spend cap correctly blocks a `$49.99` test checkout with a clear message in the overlay; with the cap raised, the missing-credentials error surfaces just as clearly. Both leave Confirm re-enabled for retry.
- Cancel closes the overlay cleanly at any point.
- The flow correctly stops before ever reaching `eth_sendTransaction`, both error paths trigger inside `create-payment`, before a transaction would ever be requested, confirmed by asserting the mock wallet's `eth_sendTransaction` handler (which throws if called) was never hit.

### Still open

- The Digital Prepaid Visa product's real `redemption_info` format is unconfirmed, see [coordinator/README.md](coordinator/README.md)'s "Unverified" section. The parser is a best guess until a real order is placed.
- No real `BITREFILL_API_KEY` or `BITREFILL_VISA_PRODUCT_ID` configured yet, so the actual send-transaction-through-to-card-fill path has not been run for real.

## 2026-07-31 - Desktop app: BrowserView render bug fixed, Bitrefill USA Visa blocked

Picked back up the Electron desktop app pivot (shell UI, `inject/checkout.js` preload, WalletConnect IPC in `main.js` - all already scaffolded from the prior session). The checkout test page was rendering black/unstyled inside the app's `BrowserView` while working fine in a normal Chrome tab. Full diagnosis and reasoning in [RESEARCH.md](RESEARCH.md#2026-07-31---desktop-app-two-real-electron-bugs-and-a-blocked-bitrefill-product).

### Fixed

- Two real bugs in `desktop/main.js` and `desktop/inject/checkout.js`: Electron's default preload sandbox was silently blocking `require("qrcode")`, and `document.documentElement` was `null` when the preload's top-level `MutationObserver.observe()` call ran. Diagnosed by adding temporary console/preload-error logging and using `webContents.capturePage()` to verify visually without needing the user's screen, per earlier feedback to stop relying on slow screenshot loops.
- Verified after fixing: checkout page renders correctly (screenshot confirmed), "Pay with Atlus" button injects correctly, clicking it opens the overlay, detects the $49.99 total, and a real WalletConnect `connect()` call returns a pairing URI rendered as a QR code, all with zero real funds moved.
- Debug instrumentation removed from `main.js` afterward, back to the clean `loadURL("https://www.google.com")` default.

### Blocked, not built: the USA Visa card pivot

The request was to drop fixed-package cards (and the overpay/waste-refund logic) in favor of Bitrefill's variable-amount **Digital Prepaid Visa (USA)**. Verified the product itself is real (confirmed against Bitrefill's own product page: genuine any-amount card, $1,000/week cap, asks for cardholder name). But a direct call to the real API, `GET /v2/products/virtual-prepaid-visa-usa`, returns `403 not_available` for this account, while the existing AU product and two other countries' general-purpose cards (South Africa, Canada) all return `200` on the same key. This isolates the block to this one product, at the account level, not a network/IP issue. Bitrefill's own terms say circumventing geoblocking for a product not available to your account risks suspension, so the incoming spec's "connect via a US IP through a built-in proxy/VPN" was deliberately not built. This needs a decision from the project owner on how to proceed (pursue Bitrefill account access for the USA product, or keep building on a fixed-package product for now) before the card-system change can move forward.

## 2026-07-31 - Card system rebuilt around merchant gift cards; Atlus app redesigned as a retailer directory

Checking the "USA Visa blocked" question further turned up a bigger problem: the AU Visa card, the one thing that was actually working, doesn't work either. Its issuer requires app-based activation with an Australian mobile number and only works inside a region-locked digital wallet, no plain card number ever exists to autofill. Both Visa-shaped products were dead ends. Full reasoning trail in [RESEARCH.md](RESEARCH.md#2026-07-31---the-card-system-changes-again-merchant-gift-cards-not-a-universal-visa).

### The replacement: pay with the checking-out merchant's own gift card

Brainstormed alternatives with the user and landed on buying a **merchant-specific gift card** (Starbucks, Target, Uber, thousands of others in Bitrefill's real catalog) instead of a universal card, matched to whatever site the user is actually on. The obvious concern, checked before building anything: wouldn't gift cards just reintroduce the same fixed-denomination overpay problem? Surveyed 77 everyday retailers across the US, UK, Canada, and Australia directly against the live `GET /v2/products/:id` endpoint (a first-pass rate-limiting bug undercounted three regions, caught and refetched with retries before drawing conclusions): **65% support an exact custom amount**, no rounding waste, US highest at 82%, Australia lowest at 42%. Confirmed the exact-amount mechanism itself against a real (unpaid, harmless) invoice: a `value: "5.00"` Starbucks card priced at exactly `5000000` USDC base units.

### Built

- [coordinator/retailers.js](coordinator/retailers.js) - new. A hand-curated catalog (~50 entries) of `{ name, domain, productId, category, type }`, each `productId` individually checked against the live API, the same "never guess a product_id at request time" rule the old single Visa env var enforced. Deliberately excludes bad fuzzy-search matches the survey surfaced (a "steam usa" search returning Ruth's Chris Steakhouse, "next uk" returning a Ukrainian phone operator).
- [coordinator/server.js](coordinator/server.js) - `create-payment` now takes `{ amountFiat, productId }` and buys an exact amount when the product's `range` covers it (`exact: true`), only falling back to the old cheapest-package logic otherwise. New `GET /api/atlus/retailers` and `GET /api/atlus/match?domain=...` endpoints. `parseCardFromRedemptionInfo` replaced with `parseRedemption`, which handles both a Visa-shaped card and a generic gift-card code, and always returns the raw redemption text alongside whatever it parsed.
- [desktop/home/](desktop/home/) - new. Atlus's start screen: a searchable grid of the retailer catalog, big cards, category grouping, "Any amount" vs "Fixed amounts" tags. Replaces the general-purpose address bar entirely, per explicit direction to make Atlus a curated storefront, not a browser.
- [desktop/shell/](desktop/shell/) - address bar removed. Top strip is now back/forward/reload/home/settings only.
- [desktop/inject/checkout.js](desktop/inject/checkout.js) - rewired around a priority chain (direct-crypto-acceptance detection → verified retailer match → unsupported) checked before any wallet connects. Added gift-card-shaped field detection (`findRedemptionTarget()`), checked before the existing credit-card selectors, since most products now redeem through a "gift card / promo code" field, which has no `autocomplete` token to key off the way credit-card fields do. The overlay always shows the raw redemption text as a copy-paste fallback now, not just whatever auto-fill managed to place.

### Verified

- Coordinator logic directly: a Starbucks `$12.34` payment returned `exact: true` with the precise USDC amount, a Target `$12.34` payment (fixed-denomination product) correctly rounded up to `$20` with `exact: false`.
- Full desktop app flow, end to end, using `webContents.capturePage()` at each step rather than manual screenshots: the new home screen renders correctly (categorized grid, search box), navigating to a gift-card-shaped test checkout page correctly detects the `$12.50` total and injects the button next to the gift-card field (not the credit-card fields, confirming the new selector priority), and clicking through opens the overlay, passes the direct-crypto and retailer-match checks, and reaches a real WalletConnect QR code.
- One real bug caught during this testing, unrelated to the feature itself: a debug capture script raced `webContents.loadURL()`'s own resolution against a separate `did-finish-load` listener and hung, since the event can fire before the listener attaches. Fixed by relying on `loadURL`'s own promise instead of a redundant listener.

## 2026-07-31 - Website copy brought up to date with the desktop app pivot

The website (`web/`) still described the old browser-extension product throughout: hero copy, the onboarding card's step 3 (Chrome "Load unpacked" instructions pointed at the `extension/` folder), the footer, and all four legal pages. None of that had been touched since the desktop app pivot, so it was actively describing a product that no longer matches what's built.

### Updated

- [web/app/page.tsx](web/app/page.tsx) - hero and three-step list now describe getting the Atlus app and picking a retailer, not installing an extension or implying "any checkout."
- [web/components/OnboardingCard.tsx](web/components/OnboardingCard.tsx) - step 3 is "Get the Atlus app," install steps changed from Chrome extension loading to `cd desktop && npm install && npm start`, the download link now points at the `desktop/` folder instead of `extension/`.
- [web/components/Footer.tsx](web/components/Footer.tsx) - "any checkout" softened to "retailers Atlus supports," "the extension" to "the Atlus app."
- [web/app/terms/page.tsx](web/app/terms/page.tsx) - "browser extension" to "desktop app" throughout; section 4 rewritten, since it described converting crypto to a stablecoin at a market rate, but the real system pays directly in USDC the user already holds and doesn't convert anything.
- [web/app/disclosures/page.tsx](web/app/disclosures/page.tsx) - extension references updated, added a line that Atlus only works with individually-verified retailers, not every checkout, and clarified the WalletConnect entry: the website uses RainbowKit's injected-wallet flow, the desktop app pairs by QR code instead, since a desktop app can't reach a browser-extension wallet.
- [web/app/privacy/page.tsx](web/app/privacy/page.tsx) and [web/app/anonymity/page.tsx](web/app/anonymity/page.tsx) - extension to app throughout, "card" language broadened to "gift-card code or card" since most retailers now issue a gift-card code, not a Visa-shaped card. The anonymity page's "what the app knows" section was also corrected while updating it: it previously implied the app is fully disconnected from the website's stored email, but the app does send the wallet address to the website backend after a payment (for the confirmation email), and the website already links that wallet to an email from onboarding, so that's a real link, not something to gloss over in a page specifically about what stays private.
- [web/app/api/transactions/complete/route.ts](web/app/api/transactions/complete/route.ts) - comment updated to note the desktop app calls this endpoint too, not just the extension.

### Verified

`npx tsc --noEmit` and `next build` both pass cleanly, all 7 routes still prerender. Confirmed against the live dev server that the new copy is actually being served, not just compiling.

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
