// FloodSense admin-users Edge Function
// Creates, deletes and (de)activates dashboard accounts with the service-role
// key, which must never be shipped to the browser. Only active admins who have
// completed 2FA (aal2) may call it.
//
// Deploy: supabase functions deploy admin-users --no-verify-jwt
// (The function verifies the caller's token itself, below. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["admin", "operator", "viewer"];
const STATUSES = ["Active", "Inactive"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Effectively permanent; cleared again with "none" on reactivation.
const BAN_FOREVER = "876000h";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // --- Verify the caller is an active admin with 2FA ------------------------
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

  if (callerProfile?.role !== "admin" || callerProfile?.status !== "Active") {
    return json({ error: "Only admins can manage users" }, 403);
  }

  const audit = (action: string, resourceId: string, details: Record<string, unknown> = {}) =>
    admin.from("audit_logs").insert({
      actor_id: caller.user.id,
      action,
      resource: "profile",
      resource_id: resourceId,
      details,
    });

  // --- Dispatch ---------------------------------------------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.action === "create") {
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "viewer").toLowerCase();

    if (!email || !password || !name) {
      return json({ error: "Name, email, and password are required." }, 400);
    }
    if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);
    if (password.length < 6) {
      return json({ error: "Password must be at least 6 characters." }, 400);
    }
    if (!ROLES.includes(role)) return json({ error: "Invalid role." }, 400);

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

    // Write the staff profile explicitly (the sign-up trigger may or may not have created it).
    // Roll back the account on failure.
    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: data.user.id,
          email,
          name,
          phone: String(body.phone ?? ""),
          location: String(body.location ?? ""),
          role,
          status: "Active",
        },
        { onConflict: "id" },
      );
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: profileError.message }, 500);
    }

    await audit("create", data.user.id, { email, role });
    return json({ id: data.user.id });
  }

  if (body.action === "set-status") {
    const { id, status } = body;
    if (!id || !STATUSES.includes(status)) return json({ error: "Invalid request." }, 400);
    if (id === caller.user.id && status === "Inactive") {
      return json({ error: "You cannot deactivate your own account." }, 400);
    }

    // Profile first: the database refuses to deactivate the last active admin.
    const { error: profileError } = await admin.from("profiles").update({ status }).eq("id", id);
    if (profileError) return json({ error: profileError.message }, 400);

    // Banning blocks sign-in and token refresh, so existing sessions end too.
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: status === "Inactive" ? BAN_FOREVER : "none",
    });
    if (banError) return json({ error: banError.message }, 400);

    await audit("set-status", id, { status });
    return json({ ok: true });
  }

  if (body.action === "delete") {
    const { id } = body;
    if (!id) return json({ error: "Missing user id." }, 400);
    if (id === caller.user.id) return json({ error: "You cannot delete your own account." }, 400);

    const { data: target } = await admin.from("profiles").select("role, status, email").eq("id", id).single();
    if (target?.role === "admin" && target?.status === "Active") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("status", "Active");
      if ((count ?? 0) <= 1) return json({ error: "Cannot delete the last active admin." }, 400);
    }

    // Deleting the auth user cascades to public.profiles.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);

    await audit("delete", id, { email: target?.email ?? null });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
