import { OnboardingCard } from "@/components/OnboardingCard";
import { GetExtensionCard } from "@/components/GetExtensionCard";

const STEPS = [
  {
    number: "1",
    title: "Connect your wallet",
    description: "Any crypto you're holding — we don't ask which.",
  },
  {
    number: "2",
    title: "We convert instantly",
    description: "Your crypto swaps to a stablecoin the moment you pay.",
  },
  {
    number: "3",
    title: "Merchant gets paid",
    description: "In ordinary fiat, in under two seconds. They never see crypto.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-neutral-200/70 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-white dark:bg-white dark:text-neutral-900">
              A
            </div>
            <span className="font-semibold tracking-tight">Atlus Pay</span>
          </div>
          <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Sepolia Testnet
          </span>
        </div>
      </header>

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
                No manual swaps, no waiting to cash out. Connect a wallet and
                check out like normal — the merchant never knows crypto was
                involved.
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

          <div className="flex flex-col items-center gap-6 lg:items-end">
            <OnboardingCard />
            <GetExtensionCard />
          </div>
        </div>
      </main>
    </div>
  );
}
