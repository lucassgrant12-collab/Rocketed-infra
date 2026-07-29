"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { supabase } from "@/lib/supabaseClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OnboardingCard() {
  const { address, isConnected } = useAccount();
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!emailConfirmed || !isConnected || !address) return;

    let cancelled = false;

    async function saveOnboarding() {
      setStatus("saving");
      const { error } = await supabase
        .from("users")
        .upsert({ email, wallet_address: address }, { onConflict: "wallet_address" });

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

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-neutral-900/5 ring-1 ring-black/5 dark:bg-neutral-900 dark:shadow-none dark:ring-white/10">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
          Step {emailConfirmed ? "2" : "1"} of 2
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          {emailConfirmed ? "Connect your wallet" : "Get started"}
        </h2>
      </div>

      {!emailConfirmed ? (
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
      ) : (
        <div className="space-y-5 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Signed up as{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {email}
            </span>
          </p>

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
        </div>
      )}
    </div>
  );
}
