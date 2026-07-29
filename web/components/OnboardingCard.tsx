"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { supabase } from "@/lib/supabaseClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXTENSION_FOLDER_URL =
  "https://github.com/lucassgrant12-collab/Rocketed-infra/tree/main/extension";

const INSTALL_STEPS = [
  {
    label: "Download the extension folder",
    detail: "From the repository above. Clone it or download it as a zip.",
  },
  { label: 'Open "chrome://extensions"', detail: "Paste that into your address bar." },
  { label: "Turn on Developer mode", detail: "Toggle in the top-right corner of that page." },
  {
    label: 'Click "Load unpacked"',
    detail: 'Select the "extension" folder from what you downloaded.',
  },
];

export function OnboardingCard() {
  const { address, isConnected } = useAccount();
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const step = !emailConfirmed ? 1 : !isConnected ? 2 : 3;

  useEffect(() => {
    if (!emailConfirmed || !isConnected || !address) return;

    let cancelled = false;

    async function saveOnboarding() {
      setStatus("saving");

      // Plain insert, falling back to a plain update on a wallet_address
      // conflict, instead of .upsert()'s INSERT ... ON CONFLICT DO UPDATE.
      // Postgres requires a SELECT policy to resolve that ON CONFLICT path
      // under RLS, even when no conflict actually exists yet, and there's
      // deliberately no SELECT policy on this table (anon can write an
      // onboarding row but can't read anyone else's email/wallet back).
      // Two plain statements only need the INSERT and UPDATE policies that
      // already exist.
      const { error: insertError } = await supabase
        .from("users")
        .insert({ email, wallet_address: address });

      const error =
        insertError?.code === "23505"
          ? (await supabase.from("users").update({ email }).eq("wallet_address", address)).error
          : insertError;

      if (cancelled) return;

      if (error) {
        setStatus("error");
        setErrorMessage(error.message);
        return;
      }

      setStatus("saved");
    }

    saveOnboarding();

    return () => {
      cancelled = true;
    };
  }, [emailConfirmed, isConnected, address, email]);

  function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    setErrorMessage("");
    setEmailConfirmed(true);
  }

  const stepTitle = step === 1 ? "Get started" : step === 2 ? "Connect your wallet" : "Get the extension";

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-neutral-900/5 ring-1 ring-black/5 dark:bg-neutral-900 dark:shadow-none dark:ring-white/10">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
          Step {step} of 3
        </p>
        <h2 className="mt-1 text-lg font-semibold">{stepTitle}</h2>
      </div>

      {step === 1 && (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 active:scale-[0.99] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Continue
          </button>
          {errorMessage && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </form>
      )}

      {step === 2 && (
        <div className="space-y-5 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Signed up as{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{email}</span>
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5 text-center">
          <div className="flex justify-center">
            <ConnectButton />
          </div>

          <div className="min-h-5">
            {status === "saving" && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Saving...</p>
            )}
            {status === "saved" && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                You&apos;re onboarded. Confirmation sent to {email}.
              </p>
            )}
            {status === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            )}
          </div>

          <div className="border-t border-neutral-100 pt-5 text-left dark:border-neutral-800">
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              Adds a &ldquo;Pay with Atlus&rdquo; button to any checkout page.
            </p>
            <ol className="mt-4 space-y-3">
              {INSTALL_STEPS.map((installStep, index) => (
                <li key={installStep.label} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{installStep.label}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {installStep.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <a
              href={EXTENSION_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Get Extension
            </a>
            <p className="mt-3 text-center text-xs text-neutral-400 dark:text-neutral-600">
              Not on the Chrome Web Store yet. This is a developer-mode install
              while Atlus Pay is still in testing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
