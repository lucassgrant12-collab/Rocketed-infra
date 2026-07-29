import { OnboardingCard } from "@/components/OnboardingCard";

const STEPS = [
  {
    number: "1",
    title: "Connect your wallet",
    description: "Any crypto you're holding. We don't ask which.",
  },
  {
    number: "2",
    title: "Install the extension",
    description: 'Adds a "Pay with Atlus" button to any checkout page you visit.',
  },
  {
    number: "3",
    title: "Pay in one click",
    description:
      "We convert instantly and fill the card fields for you. The merchant sees an ordinary payment.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-16 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="space-y-10">
          <div className="space-y-4 text-center lg:text-left">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Pay with any crypto,{" "}
              <span className="text-neutral-400 dark:text-neutral-500">
                anywhere online.
              </span>
            </h1>
            <p className="text-lg text-neutral-500 dark:text-neutral-400">
              No manual swaps, no waiting to cash out. Connect a wallet,
              install the extension, and a &ldquo;Pay with Atlus&rdquo;
              button appears at checkout on any site. No merchant
              integration required.
            </p>
          </div>

          <ul className="space-y-5">
            {STEPS.map((step) => (
              <li key={step.number} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white dark:bg-white dark:text-neutral-900">
                  {step.number}
                </span>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <OnboardingCard />
        </div>
      </div>
    </main>
  );
}
