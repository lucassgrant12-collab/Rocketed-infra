import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in web/.env.local."
  );
}

/**
 * Service-role Supabase client - bypasses row-level security entirely.
 * Server-only: never import this from a Client Component, and
 * SUPABASE_SERVICE_ROLE_KEY must never get a NEXT_PUBLIC_ prefix or it
 * ships to the browser. Used by API routes that legitimately need to read
 * across users (e.g. looking up an email by wallet address to send a
 * transaction confirmation) or write tables the anon key has no access to
 * (e.g. `transactions`).
 */
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key"
);
