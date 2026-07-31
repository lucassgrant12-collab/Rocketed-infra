import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Risk & Third-Party Disclosures | Atlus Pay" };

export default function DisclosuresPage() {
  return (
    <LegalLayout title="Risk & Third-Party Disclosures" lastUpdated="July 29, 2026">
      <LegalSection title="Current status">
        <p>
          The Atlus Pay website is informational only, it does not connect
          to a wallet or move funds. Checkout payments happen entirely
          inside the Atlus desktop app and are real: the app sends real USDC
          on the Base network directly to Bitrefill to buy a real gift card
          for whichever retailer you picked. There is no test network or
          sandbox mode anywhere in the payment path. Atlus only works with
          retailers it has individually verified, not every checkout, see
          the list inside the app. Everything below describes the product
          as it actually runs today, not a future state.
        </p>
      </LegalSection>

      <LegalSection title="External services this product uses">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Supabase
            </span>{" "}
            stores transaction records.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Reown (WalletConnect)
            </span>{" "}
            provides the Atlus app&rsquo;s wallet connection: you scan a QR
            code with your wallet app to pair, and every transaction is
            signed by approving it there.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              USDC on Base
            </span>{" "}
            is what checkout payments actually settle in, real value, chosen
            specifically because its unit (a fixed 6 decimal standard) could
            be independently verified, unlike Bitrefill&rsquo;s ETH pricing.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Bitrefill
            </span>{" "}
            issues the retailer gift card used at checkout. The Atlus app
            pays Bitrefill directly with the USDC you send, Atlus Pay never
            holds it. Bitrefill has no free test mode for this, so every
            checkout payment made through the app is a real transaction.
          </li>
        </ul>
        <p>
          None of these providers are operated by Atlus Pay, and each has its
          own terms and privacy practices governing the data it processes.
          For what each of these can and can&rsquo;t see about you
          specifically, see the{" "}
          <Link href="/anonymity" className="underline">
            Anonymity
          </Link>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection title="Cryptocurrency volatility">
        <p>
          Checkout payments are made directly in USDC, a stablecoin pegged
          to the US dollar, so the payment itself carries essentially no
          exchange-rate volatility. That protection only covers what
          happens inside Atlus Pay: however you acquired USDC in the first
          place (buying it directly, or converting a more volatile asset
          elsewhere) is outside Atlus Pay&rsquo;s visibility and control.
        </p>
      </LegalSection>

      <LegalSection title="Non-custodial responsibility">
        <p>
          Atlus Pay never holds your crypto or your private keys. That also
          means Atlus Pay cannot recover funds lost to a misplaced wallet,
          a leaked seed phrase, or a transaction sent to the wrong address.
          Wallet security is your responsibility.
        </p>
      </LegalSection>

      <LegalSection title="Smart contract and software risk">
        <p>
          Software, including wallets, the Atlus desktop app, and any smart
          contracts Atlus Pay uses, can contain bugs. Atlus Pay has not yet
          undergone a formal third-party security audit. Treat this as an
          early-stage product.
        </p>
      </LegalSection>

      <LegalSection title="No deposit insurance">
        <p>
          Funds involved in an Atlus Pay transaction are not covered by
          government deposit insurance schemes such as the FDIC or an
          equivalent scheme in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="Regulatory status">
        <p>
          Cryptocurrency regulation varies by jurisdiction and is still
          developing in many places. Atlus Pay is not a bank, and this page
          is not legal advice. Whether Atlus Pay or the parties who front
          fiat on your behalf need specific licenses in your jurisdiction is
          an open question that has not yet been reviewed by legal counsel.
        </p>
      </LegalSection>

      <LegalSection title="Service availability">
        <p>
          Atlus Pay depends on multiple third-party services listed above.
          An outage in any of them, or in the underlying blockchain network,
          can prevent a payment from completing.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
