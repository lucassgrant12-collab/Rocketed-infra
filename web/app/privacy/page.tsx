import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Privacy Policy | Atlus Pay" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="July 29, 2026">
      <LegalSection title="1. What we collect">
        <p>
          Atlus Pay has no account or sign-up. There is no email address on
          file for you unless you contact us directly. When you complete a
          payment through the Atlus app, we record the transaction: your
          public wallet address, the amount, the merchant&rsquo;s domain, and
          the last four digits of the card, if the retailer&rsquo;s gift
          card was a card-shaped one rather than a code.
        </p>
        <p>
          We deliberately do not collect your shipping address, billing
          address, full card or gift-card code, private keys, or seed
          phrase. Those never touch Atlus Pay&rsquo;s servers: gift-card
          codes and billing details are filled directly into the
          retailer&rsquo;s own checkout form by the Atlus app running on your
          device, and your wallet keys never leave your wallet.
        </p>
      </LegalSection>

      <LegalSection title="2. How we use it">
        <p>
          Transaction records are kept for our own operational record
          keeping, troubleshooting, and to detect abuse of the service. We
          do not have your email, so we cannot and do not send you a
          receipt. We do not sell your data.
        </p>
      </LegalSection>

      <LegalSection title="3. Who processes it">
        <p>The following third parties process data on our behalf:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase, for storing transaction records.</li>
          <li>
            Reown (WalletConnect), for establishing the Atlus app&rsquo;s
            connection to your wallet when you pay. They can see that a
            pairing request happened, nothing about who you are.
          </li>
        </ul>
        <p>
          A full list of external services this product depends on is on the{" "}
          <Link href="/disclosures" className="underline">
            Risk & Third-Party Disclosures
          </Link>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection title="4. What merchants see">
        <p>
          A merchant you pay through Atlus Pay sees an ordinary gift-card or
          prepaid-card redemption. They do not see your wallet address, your
          email, or that crypto was involved in the transaction at all. For
          the fuller picture of
          what stays private and what doesn&rsquo;t, including the parts
          outside Atlus Pay&rsquo;s control, see the{" "}
          <Link href="/anonymity" className="underline">
            Anonymity
          </Link>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection title="5. Data retention">
        <p>
          We retain transaction records for as long as reasonably necessary
          for our own operations and record keeping. Since transactions
          aren&rsquo;t tied to an account, you can request deletion of
          records associated with a specific wallet address at any time
          using the contact details below, subject to any records we are
          legally required to keep.
        </p>
      </LegalSection>

      <LegalSection title="6. Your rights">
        <p>
          You can request a copy of the transaction data we hold associated
          with a wallet address, ask us to correct it, or ask us to delete
          it, by contacting us below.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies and local storage">
        <p>
          The Atlus Pay website is a static informational site and sets no
          cookies and stores nothing in your browser. The Atlus desktop app
          stores your own settings (cardholder name, billing address,
          merchant blocklist) locally on your device, never on our servers,
          see the{" "}
          <Link href="/disclosures" className="underline">
            Risk & Third-Party Disclosures
          </Link>{" "}
          page.
        </p>
      </LegalSection>

      <LegalSection title="8. Children's privacy">
        <p>
          Atlus Pay is not directed at children and is not knowingly used to
          collect data from anyone under the age of 16.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>
          We may update this policy as the product changes. Material changes
          will update the date at the top of this page.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          Questions about this policy, or a request to access or delete your
          data, can be sent to{" "}
          <a
            href="mailto:lucassgrant12@gmail.com"
            className="text-neutral-900 underline dark:text-neutral-100"
          >
            lucassgrant12@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
