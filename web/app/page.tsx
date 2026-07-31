import { DownloadCard } from "@/components/DownloadCard";
import { RETAILER_COUNT } from "@/lib/retailerCount";

const STEPS = [
  {
    number: "1",
    title: "Open the Atlus app",
    description: "A standalone app you shop in, built for crypto checkout.",
  },
  {
    number: "2",
    title: "Pick a retailer",
    description: "From the retailers Atlus has already verified support for.",
  },
  {
    number: "3",
    title: "Pay with crypto",
    description:
      "Atlus buys that retailer's own gift card with your crypto and fills the code in for you.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-16 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="space-y-10">
          <div className="space-y-4 text-center lg:text-left">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Pay with crypto{" "}
              <span className="text-neutral-400 dark:text-neutral-500">
                at the retailers you already shop at.
              </span>
            </h1>
            <p className="text-lg text-neutral-500 dark:text-neutral-400">
              No manual swaps, no waiting to cash out. Open the Atlus app,
              pick a retailer, and pay directly with your wallet.
            </p>
            <p className="inline-block rounded-full bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              Works with {RETAILER_COUNT}+ retailers today
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
          <DownloadCard />
        </div>
      </div>
    </main>
  );
}
