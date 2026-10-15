// FloodSense send-email Edge Function
// Sends a saved blast by email to the matching residents. Credentials live only here,
// as Supabase secrets, never in the browser. Two providers are supported:
//
//  1. Gmail (no domain needed)  - used when both Gmail secrets are set:
//       GMAIL_USER           your Gmail address
//       GMAIL_APP_PASSWORD   a Google "App Password" (needs 2-Step Verification on the account)
//     Limits: about 500 recipients/day; each message goes to up to 50 residents in BCC.
//  2. Brevo (needs a verified sender / authenticated domain) - used otherwise:
//       BREVO_API_KEY        Brevo > SMTP & API > API Keys
//       EMAIL_SENDER_EMAIL   a sender address verified in Brevo
//
//  Optional for both: EMAIL_SENDER_NAME (defaults to "FloodSense").
//
// Deploy with "Verify JWT" OFF: the function checks the caller itself (admin/operator + 2FA).

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_BATCH = 500;       // one Brevo API call per 500 recipients (each gets their own copy)
const GMAIL_BATCH = 50;        // Gmail allows at most 100 recipients per message; residents are put in BCC
const MAX_RECIPIENTS = 5000;   // safety cap per blast
const ALL_RESIDENTS = "All Residents";

const LEVELS: Record<string, { color: string; label: string }> = {
  INFO: { color: "#2EC4B6", label: "Information" },
  WARNING: { color: "#FF6B35", label: "Warning" },
  CRITICAL: { color: "#DC2626", label: "Critical alert" },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The token has already been validated by auth.getUser(); this only reads claims.
function tokenClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=")));
  } catch {
    return {};
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildEmail(blast: { message: string; level: string; location: string; email_subject: string | null; created_at: string }) {
  const level = LEVELS[blast.level] ?? LEVELS.INFO;
  const subject = (blast.email_subject || `[FloodSense] ${level.label}: ${blast.location}`).replace(/[\r\n]+/g, " ");
  const when = new Date(blast.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" });
  const message = escapeHtml(blast.message).replace(/\n/g, "<br/>");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f9fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f9fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:${level.color};padding:20px 28px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">FloodSense Command Center</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">${escapeHtml(level.label)}</div>
        </td></tr>
        <tr><td style="padding:28px;color:#0b3c5d;">
          <div style="font-size:16px;line-height:1.6;">${message}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;font-size:13px;color:#64748b;">
            <tr><td style="padding:2px 12px 2px 0;">Area</td><td style="color:#0b3c5d;font-weight:600;">${escapeHtml(blast.location)}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;">Sent</td><td style="color:#0b3c5d;font-weight:600;">${escapeHtml(when)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px;">
          You are receiving this because you registered for flood alerts from Barangay Pamplona 3.
          In an emergency, call your local emergency hotline.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `[FloodSense] ${level.label.toUpperCase()}\n\n${blast.message}\n\nArea: ${blast.location}\nSent: ${when}\n\n` +
    "You are receiving this because you registered for flood alerts from Barangay Pamplona 3.";

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // --- Caller must be an active admin/operator who completed 2FA -------------
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not authenticated" }, 401);

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return json({ error: "Not authenticated" }, 401);

  if (tokenClaims(token).aal !== "aal2") {
    return json({ error: "Two-factor verification required" }, 403);
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", caller.user.id)
    .single();

  if (!callerProfile || callerProfile.status !== "Active" || !["admin", "operator"].includes(callerProfile.role)) {
    return json({ error: "Only admins and operators can send emails" }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const apiKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("EMAIL_SENDER_EMAIL");
  const senderName = Deno.env.get("EMAIL_SENDER_NAME") || "FloodSense";
  const gmailUser = Deno.env.get("GMAIL_USER")?.trim();
  // Google shows app passwords in groups ("abcd efgh ijkl mnop"); spaces are not part of it
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "");

  // Gmail wins when configured, since it needs no domain; otherwise Brevo
  const provider: "gmail" | "brevo" | null =
    gmailUser && gmailPass ? "gmail" : apiKey && senderEmail ? "brevo" : null;

  // Lets the dashboard show whether email is set up, without sending anything.
  if (body.action === "status") return json({ configured: provider !== null, provider });

  const blastId = String(body.blast_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(blastId)) return json({ error: "Missing or invalid blast_id" }, 400);

  if (!provider) {
    return json(
      { error: "Email is not configured yet. The blast is saved as Pending.", code: "not_configured" },
      503,
    );
  }

  // --- Claim the blast: only a Pending email can be sent, and only once --------
  const { data: blast } = await admin
    .from("sms_blasts")
    .update({ email_status: "Sending", email_error: null })
    .eq("id", blastId)
    .eq("email_status", "Pending")
    .select("id, message, level, location, email_subject, created_at")
    .maybeSingle();

  if (!blast) return json({ error: "This email was already sent, is being sent, or does not exist." }, 409);

  const finish = async (status: "Sent" | "Failed", recipients: number, errorMessage: string | null) => {
    await admin
      .from("sms_blasts")
      .update({ email_status: status, email_recipients: recipients, email_error: errorMessage })
      .eq("id", blast.id);
    await admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action: "send-email",
      resource: "sms_blast",
      resource_id: blast.id,
      details: { status, recipients, location: blast.location },
    });
  };

  try {
    // --- Recipients: active, verified residents with an email in the chosen area
    const emails = new Set<string>();
    for (let from = 0; emails.size < MAX_RECIPIENTS; from += 1000) {
      let q = admin
        .from("residents")
        .select("email")
        .eq("is_active", true)
        .eq("is_verified", true)
        .not("email", "is", null)
        .order("id")
        .range(from, from + 999);
      if (blast.location !== ALL_RESIDENTS) q = q.eq("area", blast.location);

      const { data, error } = await q;
      if (error) throw new Error(`Could not load residents: ${error.message}`);
      (data ?? []).forEach((r: { email: string }) => emails.add(r.email));
      if (!data || data.length < 1000) break;
    }

    if (emails.size === 0) {
      await finish("Failed", 0, `No active, verified residents with an email found for "${blast.location}".`);
      return json({ status: "Failed", recipients: 0, failed: 0, error: "No email recipients for this location." });
    }

    // --- Send in batches ---------------------------------------------------------------
    const { subject, html, text } = buildEmail(blast);
    const list = [...emails];
    let accepted = 0;
    let failed = 0;
    let lastError = "";

    if (provider === "gmail") {
      // Gmail over SMTP (port 465, implicit TLS). Residents go in BCC so they cannot see each
      // other's addresses; the visible "To" is the sending account itself.
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: gmailUser!, pass: gmailPass! },
      });
      try {
        for (let i = 0; i < list.length; i += GMAIL_BATCH) {
          const batch = list.slice(i, i + GMAIL_BATCH);
          try {
            const info = await transporter.sendMail({
              from: { name: senderName, address: gmailUser! },
              to: gmailUser!,
              bcc: batch,
              subject,
              text,
              html,
            });
            const rejected = (info.rejected ?? []).filter((r: string) => batch.includes(r)).length;
            accepted += batch.length - rejected;
            failed += rejected;
            if (rejected > 0) lastError = `Gmail rejected: ${(info.rejected as string[]).slice(0, 3).join(", ")}`;
          } catch (err) {
            failed += batch.length;
            lastError = `Gmail refused the message: ${(err as Error).message}`.slice(0, 250);
            console.error("Gmail SMTP error:", lastError);
          }
        }
      } finally {
        transporter.close();
      }
    } else {
      // Brevo transactional API; every resident gets their own copy
      for (let i = 0; i < list.length; i += BREVO_BATCH) {
        const batch = list.slice(i, i + BREVO_BATCH);
        try {
          const res = await fetch(BREVO_URL, {
            method: "POST",
            headers: {
              "api-key": apiKey!,
              "accept": "application/json",
              "content-type": "application/json",
              "user-agent": "FloodSense/1.0",
            },
            body: JSON.stringify({
              sender: { name: senderName, email: senderEmail },
              subject,
              htmlContent: html,
              textContent: text,
              messageVersions: batch.map((email) => ({ to: [{ email }] })),
            }),
          });
          const raw = await res.text();
          let payload: any = null;
          try {
            payload = JSON.parse(raw);
          } catch { /* not JSON, reported below */ }

          if (res.ok) {
            accepted += Array.isArray(payload?.messageIds) ? payload.messageIds.length : batch.length;
          } else {
            failed += batch.length;
            const detail = payload?.message ?? (raw.replace(/\s+/g, " ").trim() || "empty response");
            lastError = `Brevo responded ${res.status}: ${String(detail).slice(0, 220)}`;
            console.error("Brevo rejected a batch:", lastError);
          }
        } catch (err) {
          failed += batch.length;
          lastError = `Could not reach Brevo: ${(err as Error).message}`;
        }
      }
    }

    const status = accepted > 0 ? "Sent" : "Failed";
    const errorMessage = failed > 0
      ? `${failed} of ${list.length} addresses were not accepted by the email service.${lastError ? " " + lastError : ""}`
      : null;

    await finish(status, accepted, errorMessage);
    return json({ status, recipients: accepted, failed, error: errorMessage });
  } catch (err) {
    await finish("Failed", 0, (err as Error).message.slice(0, 300));
    return json({ error: (err as Error).message }, 500);
  }
});
