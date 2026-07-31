const DESKTOP_APP_FOLDER_URL =
  "https://github.com/lucassgrant12-collab/Rocketed-infra/tree/main/desktop";

const INSTALL_STEPS = [
  {
    label: "Download the desktop app folder",
    detail: "From the repository above. Clone it or download it as a zip.",
  },
  { label: "Install Node.js", detail: "If you don't already have it, from nodejs.org." },
  {
    label: "Run it",
    detail: 'Inside the "desktop" folder: "npm install" then "npm start".',
  },
];

export function DownloadCard() {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-left shadow-xl shadow-neutral-900/5 ring-1 ring-black/5 dark:bg-neutral-900 dark:shadow-none dark:ring-white/10">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Get the Atlus app</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          A standalone app you shop in. Pick a retailer, pay with crypto,
          Atlus fills in the gift card at checkout.
        </p>
      </div>

      <ol className="space-y-3">
        {INSTALL_STEPS.map((step, index) => (
          <li key={step.label} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{step.label}</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <a
        href={DESKTOP_APP_FOLDER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 block rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Get the Atlus App
      </a>
      <p className="mt-3 text-center text-xs text-neutral-400 dark:text-neutral-600">
        Not packaged as an installer yet. This runs from source while Atlus
        is still in testing.
      </p>
    </div>
  );
}
