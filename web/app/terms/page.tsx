import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Terms of Service | Atlus Pay" };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="July 29, 2026">
      <LegalSection title="1. What Atlus Pay is">
        <p>
          Atlus Pay is a non-custodial browser extension and website that lets
          you pay for goods and services at online checkouts using
          cryptocurrency you hold in your own wallet. Atlus Pay converts your
          crypto and issues a one-time virtual card to complete the payment.
          Atlus Pay does not take custody of your crypto or your fiat funds
          at any point in this process.
        </p>
        <p>
          Atlus Pay is currently in active development. Checkout payments
          made through the browser extension use real USDC on the Base
          network and issue a real prepaid card, they are not simulated.
          Website account setup (email and wallet connection) runs on the
          Sepolia test network. These terms apply regardless of whether a
          given part of the product is on a test network or not.
        </p>
      </LegalSection>

      <LegalSection title="2. Eligibility">
        <p>
          You must be able to form a binding contract in your jurisdiction to
          use Atlus Pay, and you must not be located in, or a resident of,
          any jurisdiction where use of this service would violate local
          law, including sanctions and export control regimes.
        </p>
      </LegalSection>

      <LegalSection title="3. Your wallet, your responsibility">
        <p>
          Atlus Pay never has access to your private keys or seed phrase.
          You are solely responsible for the security of your wallet,
          including any guardian or recovery configuration you set up. Atlus
          Pay cannot reverse a transaction, recover a lost wallet, or refund
          a payment once your wallet has signed it.
        </p>
      </LegalSection>

      <LegalSection title="4. No investment advice, no price guarantees">
        <p>
          Atlus Pay converts your cryptocurrency to a stablecoin at the
          market rate available at the time of payment. We do not guarantee
          any particular exchange rate, and we are not providing financial,
          investment, or tax advice. You are responsible for understanding
          the tax and legal consequences of converting and spending your own
          crypto.
        </p>
      </LegalSection>

      <LegalSection title="5. Prohibited use">
        <p>
          You agree not to use Atlus Pay for any unlawful purpose, including
          money laundering, financing of terrorism, sanctions evasion, or to
          pay for goods or services that are illegal in your jurisdiction or
          the merchant&rsquo;s.
        </p>
      </LegalSection>

      <LegalSection title="6. Fees">
        <p>
          Atlus Pay and the parties who front fiat on your behalf (see the
          Risk & Third-Party Disclosures page) may charge a fee, disclosed to
          you before you confirm a payment. Network and card-issuing fees
          outside our control may also apply.
        </p>
      </LegalSection>

      <LegalSection title="7. Third-party services">
        <p>
          Completing a payment relies on third-party infrastructure,
          including wallet software, blockchain networks, and card issuing
          providers, none of which Atlus Pay controls. A full list is on the
          Risk & Third-Party Disclosures page. We are not responsible for
          outages, errors, or losses caused by those third parties.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitation of liability">
        <p>
          Atlus Pay is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis, without warranties of any kind. To the
          maximum extent permitted by law, Atlus Pay is not liable for
          indirect, incidental, or consequential damages arising from your
          use of the service.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to these terms">
        <p>
          We may update these terms as the product changes. Material changes
          will update the date at the top of this page. Continued use of
          Atlus Pay after a change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection title="10. Governing law">
        <p>
          The governing law and jurisdiction for these terms have not yet
          been finalized with legal counsel. This section will be updated
          once that review is complete.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          Questions about these terms can be sent to{" "}
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
