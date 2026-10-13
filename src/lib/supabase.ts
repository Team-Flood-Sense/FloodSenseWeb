import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY environment variable.",
  );
}

// Read before the client parses (and clears) the URL hash, so the Change
// Password page knows the user arrived from a reset-password email, or that
// the link was rejected (e.g. expired).
const initialHash = new URLSearchParams(
  typeof window !== "undefined" ? window.location.hash.slice(1) : "",
);

let recoveryActive = initialHash.get("type") === "recovery";
const recoveryLinkError = initialHash.get("error_description");

export const recovery = {
  /** True until the reset is completed (or cleared) in this tab. */
  isActive: () => recoveryActive,
  /** Error text when the reset link was invalid or expired. */
  linkError: recoveryLinkError,
  clear: () => {
    recoveryActive = false;
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

/** Reads the assurance level (aal1 / aal2) from an access token. */
export function tokenAal(accessToken: string | undefined): "aal1" | "aal2" | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).aal ?? null;
  } catch {
    return null;
  }
}
