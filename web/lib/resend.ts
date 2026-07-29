import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn(
    "Missing RESEND_API_KEY. Set it in web/.env.local to send transaction confirmation emails."
  );
}

// Server-only. Unlike the Supabase client, the Resend SDK throws
// synchronously at construction time if the key is missing/empty - which
// runs during `next build`'s page-data collection and would break the
// build before .env.local is ever filled in. Falling back to a placeholder
// defers the failure to the actual .emails.send() call instead, which the
// route handler already treats as a normal, handled failure path.
export const resend = new Resend(apiKey || "re_placeholder_key");
