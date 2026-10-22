// FloodSense bootstrap-admin Edge Function
// Creates the FIRST admin account from the web app's /setup page. It refuses
// to do anything once an admin exists, so it can be called without signing in.
//
// Deploy: supabase functions deploy bootstrap-admin --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSED = "Setup is already complete. Ask an existing admin to create your account.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Cheap early exit; the real guarantee is claim_first_admin below.
  const { data: exists, error: existsError } = await admin.rpc("admin_exists");
  if (existsError) return json({ error: existsError.message }, 500);
  if (exists) return json({ error: CLOSED }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!name || !email || !password) {
    return json({ error: "Name, email, and password are required." }, 400);
  }
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata can only be set by this server code, so residents can never mark themselves staff
    app_metadata: { kind: "staff" },
    user_metadata: { name, phone: body.phone ?? "", location: body.location ?? "" },
  });
  if (error) {
    const code = (error as any).code;
    if (code === "email_exists" || code === "user_already_exists") {
      return json({ error: "This email is already registered." }, 409);
    }
    return json({ error: error.message }, 400);
  }

  // Make sure a profile row exists (the sign-up trigger may or may not have created it)
  await admin
    .from("profiles")
    .upsert(
      {
        id: data.user.id,
        email,
        name,
        phone: String(body.phone ?? ""),
        location: String(body.location ?? ""),
        role: "viewer",
        status: "Inactive",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

  // Atomically make this user the first admin (fails if someone beat us to it).
  const { data: claimed, error: claimError } = await admin.rpc("claim_first_admin", {
    target: data.user.id,
  });
  if (claimError || !claimed) {
    await admin.auth.admin.deleteUser(data.user.id);
    return json({ error: claimError?.message ?? CLOSED }, claimError ? 500 : 403);
  }

  return json({ id: data.user.id });
});
