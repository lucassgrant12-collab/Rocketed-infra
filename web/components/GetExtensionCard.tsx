"use client";

import { useState } from "react";

const EXTENSION_FOLDER_URL =
  "https://github.com/lucassgrant12-collab/Rocketed-infra/tree/main/extension";

const STEPS = [
  {
    label: "Download the extension folder",
    detail: "From the repository above — clone it or download it as a zip.",
  },
  { label: 'Open "chrome://extensions"', detail: "Paste that into your address bar." },
  { label: "Turn on Developer mode", detail: "Toggle in the top-right corner of that page." },
  {
    label: 'Click "Load unpacked"',
    detail: 'Select the "extension" folder from what you downloaded.',
  },
];

export function GetExtensionCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-neutral-900/5 ring-1 ring-black/5 dark:bg-neutral-900 dark:shadow-none dark:ring-white/10">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Get the extension</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Adds a &ldquo;Pay with Atlus&rdquo; button to any checkout page.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 active:scale-[0.99] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {expanded ? "Hide install steps" : "Get Extension"}
      </button>

      {expanded && (
        <div className="mt-6 space-y-4 text-left">
          <ol className="space-y-3">
            {STEPS.map((step, index) => (
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
            href={EXTENSION_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-neutral-200 px-4 py-2.5 text-center text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Open the extension folder on GitHub
          </a>
          <p className="text-xs text-neutral-400 dark:text-neutral-600">
            Not on the Chrome Web Store yet — this is a developer-mode install
            while Atlus Pay is still in testing.
          </p>
        </div>
      )}
    </div>
  );
}
