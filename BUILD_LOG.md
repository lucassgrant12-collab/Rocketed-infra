# Build Log

Chronological engineering journal: what was done, in what order, and why. This is the "what happened" record — deeper reasoning and open tradeoffs live in [RESEARCH.md](RESEARCH.md); presentation-ready material lives in [SLIDES.md](SLIDES.md).

Convention: one entry per work session, newest at the bottom, dated. Log decisions and direction changes, not just file diffs — git history already has the diffs.

---

## 2026-07-29 — Project pivot: Atlus Pay

- Previous project direction (DeFi coverage protocol: attestation + tranched risk pool + watcher verification) was scrapped by the user before any code was written. Its docs were deleted.
- New project defined: **Atlus Pay** — a non-custodial, privacy-preserving crypto payment system ("pay for anything online with any crypto, as easy as Apple Pay"). Three components: User Vault, Payer Node Network, Atlus Protocol Core. Full system debrief logged in [RESEARCH.md](RESEARCH.md#2026-07-29--system-debrief-atlas-pay).
- Documentation workflow recreated for the new project: this file, `RESEARCH.md`, `SLIDES.md`.
- Design decision: **onboarding is username entry + wallet connect**, no separate KYC/identity step at v1. **Payment confirmation is sent by email**, not push notification (overrides the push-notification mention in the original system debrief).
- User states core tech (double-entry ledger, non-custodial vault w/ Shamir guardian recovery, RSA blind signature module, Payer Node adapter pattern) is already built elsewhere — not yet present in this repo. Needs to be located/imported before implementation work starts on top of it.
- No code written yet in this repo. Next step: locate/import existing tech stack pieces, then decide build order.

## 2026-07-29 — Rebrand to Atlus + Treasury Model pivot (v1)

- Project renamed from "Atlas Pay" to "Atlus Pay" throughout all docs.
- v1 architecture revised: Atlus itself acts as the sole payer node (the "Treasury Model") — converts user crypto to USDT, takes a fee spread, pays merchants directly via a Stripe Issuing sandbox virtual card, retains the USDT as profit, off-ramps later. The independent Payer Node Network is now a v2/future scaling step, not a v1 requirement. Full detail and the non-custodial-claim tension this introduces are logged in [RESEARCH.md](RESEARCH.md#2026-07-29--pivot-atlus-treasury-model-v1).
- Fiat rails are simulated (Stripe Issuing sandbox) for this project — no real money moves.
- Starting implementation: website onboarding (email capture + wallet connect), a `.env` for secrets, and Supabase SQL migrations for the onboarding data. Onboarding is now email capture + wallet connect (supersedes the earlier "username + wallet connect" decision — email doubles as the capture field and the confirmation channel).

## 2026-07-29 — Onboarding v1 built: email capture + wallet connect

- Scaffolded `web/` — Next.js (App Router, TypeScript, Tailwind), via `create-next-app`.
- Installed `wagmi` + `viem` + `@rainbow-me/rainbowkit` + `@tanstack/react-query` for wallet connect, `@supabase/supabase-js` for the backend.
- [web/lib/wagmi.ts](web/lib/wagmi.ts) — wagmi config via RainbowKit's `getDefaultConfig`, targeting Sepolia testnet (no real funds — matches the "fiat rails simulated" project scope).
- [web/app/providers.tsx](web/app/providers.tsx) — wraps the app in `WagmiProvider` / `QueryClientProvider` / `RainbowKitProvider`; wired into [web/app/layout.tsx](web/app/layout.tsx).
- [web/app/page.tsx](web/app/page.tsx) — the onboarding flow: email field with basic format validation → RainbowKit `ConnectButton` → on connect, upserts `{ email, wallet_address }` into Supabase keyed on `wallet_address`, with saving/saved/error states shown inline.
- [web/lib/supabaseClient.ts](web/lib/supabaseClient.ts) — Supabase client reading `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [supabase/001_users.sql](supabase/001_users.sql) — `public.users` table (`id`, `email`, `wallet_address` unique, `created_at`), RLS enabled with insert/update policies for the `anon` role and no select policy, so the anon key can write onboarding rows but can't read anyone else's email/wallet back out.
- `web/.env.example` (committed) and `web/.env.local` (gitignored) — both list `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Values are blank; fill in `.env.local` with real project credentials.

### Two build issues hit and fixed (see SLIDES.md for the slide version of this)

1. **RainbowKit's `getDefaultConfig` throws at build time if `projectId` is empty** — `next build` failed prerendering `/_not-found` with "No projectId found" even though the app doesn't touch WalletConnect at that point. Fixed by falling back to a placeholder string (`atlus-pay-placeholder-project-id`) when the env var is unset — real WalletConnect connections won't work until a real project ID from cloud.reown.com is set, but the build/dev server no longer hard-fails without one.
2. **Supabase client was throwing at module import time** when env vars were missing, which runs during Next.js prerendering and would have broken `next build` before `.env.local` is ever filled in. Fixed by falling back to placeholder URL/key and `console.warn` instead of throwing — a real Supabase call will fail at request time and surface through the existing error state in `page.tsx`, instead of crashing the build.

### Verified

- `npm run build` succeeds.
- `npm run dev` serves the page; confirmed via curl that the rendered HTML contains the title, email input, and Continue button, no error boundary triggered.

### Still open before this is real

- `web/.env.local` needs actual Supabase project URL/anon key and a WalletConnect Cloud project ID — onboarding won't actually persist to Supabase or support WalletConnect-based wallets until then.
- `supabase/001_users.sql` needs to be run against the actual Supabase project (SQL editor or CLI) before the app's upsert will succeed.

## 2026-07-29 — Phantom wallet added; connect flow verified end-to-end

### How wallet connect actually works

[web/lib/wagmi.ts](web/lib/wagmi.ts) switched from RainbowKit's `getDefaultConfig` (a fixed default wallet set) to explicit `connectorsForWallets`, listing `metaMaskWallet`, `phantomWallet`, `rainbowWallet`, `coinbaseWallet`, `walletConnectWallet`. The first four detect the wallet's browser extension directly (e.g. Phantom's connector looks for `window.phantom.ethereum`) and connect via a standard EIP-1193 `request({ method: "eth_requestAccounts" })` call — no WalletConnect project ID involved. Only the `walletConnectWallet` option (for wallets without a matching browser extension, e.g. scanning a QR code with a mobile wallet) actually needs the real project ID from cloud.reown.com; until `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set, that one specific option won't work, but it no longer breaks the build (see the placeholder-projectId fix from the previous entry) and the other four wallets are unaffected.

Once a wallet connects, `useAccount()` in [web/app/page.tsx](web/app/page.tsx) picks up the address, which triggers the existing onboarding-save effect. Reconnection is automatic on future visits — wagmi silently calls `eth_accounts` on mount, and if the wallet already authorized this site, the user lands back in a connected state without re-clicking anything.

### Verification method

No real browser wallet extension is available in this dev environment, so verified with a Playwright script that injects a mock EIP-1193 provider at `window.phantom.ethereum` (same shape a real Phantom extension exposes) before the page loads, then drives the actual UI: fills the email field, clicks Continue, opens the connect modal, clicks Phantom, and asserts the connected state renders.

- Confirmed the modal lists all 5 configured wallets: MetaMask, Phantom, Rainbow, Coinbase Wallet, WalletConnect.
- First mock attempt had `eth_accounts` always return an address, which caused wagmi to silently auto-reconnect before the modal was ever opened — a real finding about existing behavior (persistent connection across reloads works), not a bug, but it meant the test wasn't exercising the manual click-to-connect path. Fixed the mock to only return an address from `eth_requestAccounts` (i.e. only after an explicit connect), matching how a real un-authorized wallet behaves.
- With that fix, the full flow completed: address `0x12…7890` rendered in the RainbowKit account button after clicking Phantom in the modal, and the onboarding-save effect fired immediately after, failing with a visible "TypeError: Failed to fetch" — expected, since `.env.local` still points at a placeholder Supabase URL. Confirms the error-handling path (Slide 10 / the earlier "don't throw at import time" fix) degrades gracefully instead of crashing.

Same underlying `injected()` wagmi connector path is used for MetaMask, Rainbow, and Coinbase Wallet's browser-extension mode, so this test covers their connection mechanics too — only WalletConnect's QR path is untested here (needs a real project ID and an actual mobile wallet to test meaningfully).

## 2026-07-29 — Landing page design pass

- Extracted the stateful onboarding logic (email step + wallet connect + Supabase save) out of `app/page.tsx` into [web/components/OnboardingCard.tsx](web/components/OnboardingCard.tsx), styled as a white/dark card (rounded-2xl, soft shadow, ring) matching the polish of RainbowKit's own connect modal — same visual language, since that's the one piece of UI on the page already proven to look right.
- `app/page.tsx` is now the marketing shell around that card: header with wordmark + a "Sepolia Testnet" badge (honest signal that this is a demo, not real funds), a two-column hero on desktop (headline/subtext/3-step "how it works" list next to the card, stacking to one column on mobile), and a one-line footer.
- Fixed a pre-existing bug in [web/app/globals.css](web/app/globals.css): `body` hardcoded `font-family: Arial`, silently overriding the Geist font that's loaded via `next/font` and exposed as `--font-sans` — the custom font was never actually rendering. Now reads `var(--font-sans)` first.
- Verified: `npm run build` passes; screenshotted the page in light, dark, and mobile viewports via Playwright — all render correctly, card and hero both responsive. Re-ran the mock-wallet Playwright test from the previous entry against the new layout to confirm the connect flow still works unchanged after the restructure (it does — same `id="email"` and button text, so the DOM contract didn't shift).

### Slide format convention (reference)

Each slide in `SLIDES.md` follows this structure (mirrors the reference screenshot the user provided):

```
## Slide N — "quotable title"

**Talking points**
- ...

**Code piece 1 — [what it is]**
```lang
...
```

**Code piece 2 — [what it is, e.g. the piece that didn't work / the connecting piece]**
```lang
...
```

**How they connect:** prose explaining how piece 1 and piece 2 relate, and if applicable, what changed between a broken first attempt and the working version.
```

When something breaks during implementation and gets fixed, capture *both* versions on the slide (broken → what changed → working), not just the final code — that contrast is the point of the deck.
