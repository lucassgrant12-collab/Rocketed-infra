import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Privacy Policy | Atlus Pay" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="July 29, 2026">
      <LegalSection title="1. What we collect">
        <p>
          When you sign up on the Atlus Pay website, we collect the email
          address you enter and the public wallet address you connect. When
          you complete a payment through the Atlus app, we record the
          transaction amount, the merchant&rsquo;s domain, and the last four
          digits of the card, if the retailer&rsquo;s gift card was a
          card-shaped one rather than a code.
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
          Your email is used to send you a summary after a payment completes
          and for account related communication. Your wallet address is used
          to identify your account, associate payments with it, and
          determine the virtual card details needed for a transaction. We do
          not sell your data.
        </p>
      </LegalSection>

      <LegalSection title="3. Who processes it">
        <p>The following third parties process data on our behalf:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase, for storing account and transaction records.</li>
          <li>Resend, for delivering transaction confirmation emails.</li>
          <li>
            Reown (WalletConnect) and the wallet connector libraries in the
            Atlus app, for establishing a connection to your wallet. They
            can see that a connection request happened, not your Atlus Pay
            email.
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
          We retain account and transaction records for as long as your
          account is active, plus a reasonable period after for record
          keeping. You can request deletion at any time using the contact
          details below, subject to any records we are legally required to
          keep.
        </p>
      </LegalSection>

      <LegalSection title="6. Your rights">
        <p>
          You can request a copy of the data we hold about you, ask us to
          correct it, or ask us to delete it, by contacting us below.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies and local storage">
        <p>
          The website uses local browser storage to keep your wallet
          connection state between visits. We do not use advertising or
          cross-site tracking cookies.
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
