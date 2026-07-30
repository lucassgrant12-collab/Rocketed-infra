import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resend } from "@/lib/resend";

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "Atlus Pay <onboarding@resend.dev>";

// Called by the extension's background.js right after a payment succeeds
// (fire-and-forget - a failure here doesn't undo the payment, it just
// means no confirmation email goes out). Records the transaction and, if
// the paying wallet has a known email, sends a summary.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.amount) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  // walletAddress is optional: the extension can be used without ever
  // going through website onboarding (no wallet-bridge sync happened), in
  // which case the paying wallet is genuinely unknown. The transaction
  // still gets recorded; only the confirmation email gets skipped.
  const walletAddress = body.walletAddress ? String(body.walletAddress) : null;
  const amount = String(body.amount);
  const merchant = body.merchant ? String(body.merchant) : null;
  const cardLast4 = body.cardLast4 ? String(body.cardLast4) : null;

  // Wrapped in try/catch on top of Supabase/Resend's own {data, error}
  // return contract: that contract covers query-level failures (bad SQL,
  // RLS denial), but a genuine network failure, e.g.
  // NEXT_PUBLIC_SUPABASE_URL still pointing at the placeholder host
  // because .env.local isn't filled in yet, throws instead. Without this,
  // that surfaces as Next.js's generic unhandled-exception 500 instead of
  // a message that says what's actually wrong.
  try {
    const { error: insertError } = await supabaseAdmin.from("transactions").insert({
      wallet_address: walletAddress,
      amount,
      merchant,
      card_last4: cardLast4,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (!walletAddress) {
      return NextResponse.json({ stored: true, emailed: false });
    }

    // Best-effort email lookup. A transaction still gets recorded above
    // even if this wallet has no onboarded email. It just means no email
    // goes out.
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (!user?.email) {
      return NextResponse.json({ stored: true, emailed: false });
    }

    const { error: emailError } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email,
      subject: `Payment confirmed${merchant ? ` for ${merchant}` : ""}`,
      html: renderConfirmationEmail({ amount, merchant, cardLast4 }),
    });

    if (emailError) {
      return NextResponse.json({ stored: true, emailed: false, emailError: emailError.message });
    }

    return NextResponse.json({ stored: true, emailed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Transaction/email pipeline failed: ${message}` },
      { status: 500 }
    );
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderConfirmationEmail({
  amount,
  merchant,
  cardLast4,
}: {
  amount: string;
  merchant: string | null;
  cardLast4: string | null;
}) {
  const rows = [`<tr><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;color:#737373;">Amount</td><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:600;">$${escapeHtml(amount)}</td></tr>`];

  if (merchant) {
    rows.push(
      `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;color:#737373;">Merchant</td><td style="padding:8px 0;border-bottom:1px solid #e5e5e5;text-align:right;">${escapeHtml(merchant)}</td></tr>`
    );
  }

  if (cardLast4) {
    rows.push(
      `<tr><td style="padding:8px 0;color:#737373;">Card used</td><td style="padding:8px 0;text-align:right;">•••• ${escapeHtml(cardLast4)}</td></tr>`
    );
  }

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;color:#171717;">
      <h1 style="font-size:18px;">Payment confirmed</h1>
      <p style="font-size:15px;color:#525252;">Here's a summary of your Atlus Pay transaction.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        ${rows.join("")}
      </table>
      <p style="font-size:13px;color:#a3a3a3;margin-top:24px;">
        Atlus Pay never held your crypto or your fiat - a one-time card was issued and paid for the exact amount above at the moment of purchase.
      </p>
    </div>
  `;
}
