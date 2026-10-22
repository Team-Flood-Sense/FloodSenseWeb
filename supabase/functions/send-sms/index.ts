// FloodSense send-sms Edge Function
// Sends a saved SMS blast to the matching residents through Semaphore.
// The Semaphore API key lives only here, as a Supabase secret, never in the browser.
//
// Secrets (Dashboard > Edge Functions > Secrets):
//   SEMAPHORE_API_KEY       required
//   SEMAPHORE_SENDER_NAME   optional (must be approved by Semaphore, else their default is used)
//
// Deploy with "Verify JWT" OFF: the function checks the caller itself (admin/operator + 2FA).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";
const BATCH_SIZE = 500;        // Semaphore accepts up to 1000 numbers per request
const MAX_RECIPIENTS = 5000;   // safety cap per blast
const ALL_RESIDENTS = "All Residents";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Staff accounts (the profiles table) never receive resident alerts
async function loadStaff(admin: any) {
  const { data } = await admin.from("profiles").select("id, email");
  const rows = (data ?? []) as { id: string; email: string | null }[];
  return {
    ids: new Set(rows.map((p) => p.id)),
    emails: new Set(rows.map((p) => String(p.email ?? "").toLowerCase()).filter(Boolean)),
  };
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
    return json({ error: "Only admins and operators can send SMS" }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const apiKey = Deno.env.get("SEMAPHORE_API_KEY");

  // Lets the dashboard show whether the gateway is set up, without sending anything.
  if (body.action === "status") return json({ configured: Boolean(apiKey) });

  const blastId = String(body.blast_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(blastId)) return json({ error: "Missing or invalid blast_id" }, 400);

  if (!apiKey) {
    return json(
      { error: "The SMS gateway is not configured yet. The blast is saved as Pending.", code: "not_configured" },
      503,
    );
  }

  // --- Claim the blast: only a Pending blast can be sent, and only once -------
  const { data: blast } = await admin
    .from("sms_blasts")
    .update({ status: "Sending", error_message: null })
    .eq("id", blastId)
    .eq("status", "Pending")
    .select("id, message, location, triggered_by")
    .maybeSingle();

  if (!blast) return json({ error: "This blast was already sent, is being sent, or does not exist." }, 409);

  const finish = async (status: "Sent" | "Failed", recipients: number, errorMessage: string | null) => {
    await admin.from("sms_blasts").update({ status, recipients, error_message: errorMessage }).eq("id", blast.id);
    await admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action: "send",
      resource: "sms_blast",
      resource_id: blast.id,
      details: { status, recipients, location: blast.location },
    });
  };

  try {
    // --- Recipients: active, verified residents for the chosen area -----------
    const staff = await loadStaff(admin);
    const phones = new Set<string>();
    for (let from = 0; phones.size < MAX_RECIPIENTS; from += 1000) {
      let q = admin
        .from("residents")
        .select("id, phone, email")
        .eq("is_active", true)
        .eq("is_verified", true)
        .not("phone", "is", null)
        .order("id")
        .range(from, from + 999);
      if (blast.location !== ALL_RESIDENTS) q = q.eq("area", blast.location);

      const { data, error } = await q;
      if (error) throw new Error(`Could not load residents: ${error.message}`);
      (data ?? []).forEach((r: { id: string; phone: string; email: string | null }) => {
        if (staff.ids.has(r.id) || (r.email && staff.emails.has(r.email.toLowerCase()))) return;
        phones.add(r.phone);
      });
      if (!data || data.length < 1000) break;
    }

    if (phones.size === 0) {
      await finish("Failed", 0, `No active, verified residents found for "${blast.location}".`);
      return json({ status: "Failed", recipients: 0, failed: 0, error: "No recipients for this location." });
    }

    // --- Send through Semaphore in batches --------------------------------------
    const text = `[FloodSense] ${blast.message}`;
    const senderName = Deno.env.get("SEMAPHORE_SENDER_NAME");
    const list = [...phones];
    let accepted = 0;
    let failed = 0;
    let lastError = "";

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      const form = new URLSearchParams({ apikey: apiKey, number: batch.join(","), message: text });
      if (senderName) form.set("sendername", senderName);

      try {
        const res = await fetch(SEMAPHORE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            // Some firewalls reject requests that arrive without a recognisable user agent
            "User-Agent": "FloodSense/1.0 (+https://supabase.com)",
          },
          body: form,
        });
        const raw = await res.text();
        let payload: unknown = null;
        try {
          payload = JSON.parse(raw);
        } catch { /* not JSON, reported below */ }

        if (res.ok && Array.isArray(payload)) {
          accepted += payload.length;
          failed += Math.max(0, batch.length - payload.length);
        } else {
          failed += batch.length;
          // Semaphore reports problems (bad key, no credits, bad sender) as JSON like {"apikey":["..."]}
          const detail = payload !== null ? JSON.stringify(payload) : raw.replace(/\s+/g, " ").trim() || "empty response";
          lastError = `Gateway responded ${res.status} (${res.headers.get("server") ?? "unknown server"}): ${detail.slice(0, 220)}`;
          console.error("Semaphore rejected a batch:", lastError);
        }
      } catch (err) {
        failed += batch.length;
        lastError = `Could not reach the SMS gateway: ${(err as Error).message}`;
      }
    }

    const status = accepted > 0 ? "Sent" : "Failed";
    const errorMessage = failed > 0
      ? `${failed} of ${list.length} numbers were not accepted by the SMS gateway.${lastError ? " " + lastError : ""}`
      : null;

    await finish(status, accepted, errorMessage);
    return json({ status, recipients: accepted, failed, error: errorMessage });
  } catch (err) {
    await finish("Failed", 0, (err as Error).message.slice(0, 300));
    return json({ error: (err as Error).message }, 500);
  }
});
