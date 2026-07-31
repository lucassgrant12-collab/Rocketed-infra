import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/LegalLayout";

export const metadata = { title: "Anonymity | Atlus Pay" };

export default function AnonymityPage() {
  return (
    <LegalLayout title="Anonymity" lastUpdated="July 30, 2026">
      <LegalSection title="The short version">
        <p>
          Atlus Pay is anonymous to a great extent, not completely. A
          merchant you pay never learns your wallet address, your email, or
          that crypto was involved at all. Atlus itself does know the link
          between your email and your wallet address, since that&rsquo;s how
          onboarding and confirmation emails work. And the blockchain
          transaction your wallet makes is public, the way every blockchain
          transaction is. This page explains exactly where that line sits.
        </p>
      </LegalSection>

      <LegalSection title="What merchants see: nothing crypto related">
        <p>
          At checkout, the Atlus app fills in an ordinary gift-card code, or
          a one-time card number, expiry, and CVV, depending on which the
          retailer issues. The merchant redeems it the same way they&rsquo;d
          handle any other gift card or prepaid card. They never see your
          wallet address, never see your email, and never learn that the
          payment originated from crypto at all.
        </p>
        <p>
          Billing details, when a checkout form asks for them, are filled
          directly into the retailer&rsquo;s own form by the Atlus app
          running on your device. They never pass through Atlus&rsquo;s
          servers, so there&rsquo;s nothing for Atlus to even have on file
          connecting your real-world identity to a purchase.
        </p>
      </LegalSection>

      <LegalSection title="What the Atlus app knows: a wallet address, nothing else">
        <p>
          The desktop app itself only ever learns your wallet address, from
          the WalletConnect session you approve when paying. It never sees
          or asks for your email. After a payment completes, the app does
          send that wallet address to the Atlus website&rsquo;s backend so a
          confirmation email can be sent, and the website already knows
          which email that wallet address belongs to from onboarding, so
          this is a real link, not something to gloss over. See the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>{" "}
          for exactly what the website stores.
        </p>
      </LegalSection>

      <LegalSection title="What Atlus knows: your email and your wallet address">
        <p>
          Atlus is not anonymous to Atlus. Onboarding stores your email
          together with your wallet address, on purpose, so you can get a
          confirmation after a payment and so support is possible if
          something goes wrong. Row-level security stops any other user of
          the public anon key from reading that data back, but it doesn&rsquo;t
          hide it from Atlus&rsquo;s own backend, which needs it to function.
          Full detail on exactly what&rsquo;s stored and why is in the{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="What the blockchain reveals: your wallet's public history">
        <p>
          A blockchain transaction is pseudonymous, not anonymous. Anyone
          can look up a wallet address and see everything it has ever done.
          If that wallet address has ever been linked to your identity
          elsewhere, an exchange that required ID verification to buy the
          crypto in the first place, for example, a payment made through
          Atlus Pay can in principle be traced back to you through that
          link. Using a wallet with no such history attached is the only
          way to avoid that, and it&rsquo;s outside anything Atlus Pay itself
          can control.
        </p>
      </LegalSection>

      <LegalSection title="What the card issuer sees">
        <p>
          Whichever provider issues the gift card or prepaid card (see the{" "}
          <Link href="/disclosures" className="underline">
            Risk & Third-Party Disclosures
          </Link>{" "}
          page for who that is today) receives a crypto payment to a
          generated address and issues a card in return. Their own
          compliance policies, not Atlus&rsquo;s, determine what identity
          information, if any, they require for that. Atlus doesn&rsquo;t
          control or see whatever checks they run.
        </p>
      </LegalSection>

      <LegalSection title="Ordinary web metadata still applies">
        <p>
          Using the Atlus Pay website or desktop app involves the same
          network metadata any website or app sees: your IP address is
          visible to the
          infrastructure providers listed on the{" "}
          <Link href="/disclosures" className="underline">
            Risk & Third-Party Disclosures
          </Link>{" "}
          page, the way it would be for any site you visit. Atlus Pay
          doesn&rsquo;t run over an anonymity network like Tor, and doesn&rsquo;t
          claim to.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
