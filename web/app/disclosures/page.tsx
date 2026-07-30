import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Risk & Third-Party Disclosures | Atlus Pay" };

export default function DisclosuresPage() {
  return (
    <LegalLayout title="Risk & Third-Party Disclosures" lastUpdated="July 29, 2026">
      <LegalSection title="Current status">
        <p>
          Atlus Pay currently runs on the Sepolia test network with a
          sandboxed card issuing provider. No real cryptocurrency or real
          fiat currency moves through the service in this state. This page
          describes the risks that apply once a production deployment with
          real funds exists, and the external services the product relies
          on today.
        </p>
      </LegalSection>

      <LegalSection title="External services this product uses">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Supabase
            </span>{" "}
            stores account and transaction records.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Resend
            </span>{" "}
            delivers transaction confirmation emails.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Reown (WalletConnect) and RainbowKit
            </span>{" "}
            provide the wallet connection interface used by the website and
            extension.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              wagmi and viem
            </span>{" "}
            handle the underlying blockchain read and write calls.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Ethereum (currently the Sepolia test network)
            </span>{" "}
            is the network your wallet transactions settle on.
          </li>
          <li>
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Bitrefill
            </span>{" "}
            is the planned provider for issuing the one-time prepaid card used
            at checkout. The card issuing step is currently a mock while a
            live Bitrefill account is being set up, and returns obviously
            fake test card data, never anything resembling a real card.
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
          The value of cryptocurrency can change quickly. Atlus Pay converts
          your crypto to a stablecoin at the moment you confirm a payment,
          which limits your exposure to that specific transaction, but does
          not protect the rest of your holdings from market movement before
          or after.
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
          Software, including wallets, browser extensions, and any smart
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
