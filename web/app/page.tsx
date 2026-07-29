"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { supabase } from "@/lib/supabaseClient";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Home() {
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
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Atlus Pay</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Pay for anything online with any crypto.
          </p>
        </div>

        {!emailConfirmed ? (
          <form onSubmit={handleEmailSubmit} className="space-y-3 text-left">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Continue
            </button>
            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-500">
              Signed up as <span className="font-medium">{email}</span>
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
            {status === "saving" && (
              <p className="text-sm text-neutral-500">Saving...</p>
            )}
            {status === "saved" && (
              <p className="text-sm text-green-600">
                You&apos;re onboarded. Confirmation sent to {email}.
              </p>
            )}
            {status === "error" && (
              <p className="text-sm text-red-600">{errorMessage}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
