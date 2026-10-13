import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, tokenAal } from "@/lib/supabase";

export type Role = "admin" | "operator" | "viewer";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: Role | null;
  status: string;
  location: string;
  photoURL?: string;
  lastActive: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null; // ✅ full profiles row
  role: Role | null;
  /** Assurance level of the session: aal2 once the 2FA code was verified. */
  aal: "aal1" | "aal2" | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  aal: null,
  loading: true,
  refreshProfile: async () => {},
});

const ROLES: Role[] = ["admin", "operator", "viewer"];

async function fetchProfile(authUser: User): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    uid: authUser.id,
    name: data.name || authUser.email?.split("@")[0] || "Unknown",
    email: data.email || authUser.email || "",
    phone: data.phone || "",
    role: ROLES.includes(data.role) ? data.role : null,
    status: data.status || "Inactive",
    location: data.location || "",
    photoURL: data.avatar || "",
    lastActive: data.last_active,
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Track the auth session. Supabase calls are not awaited inside this
  // callback (that can deadlock the auth client); profile loading happens in
  // the effect below instead.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((prev) => {
        const next = session?.user ?? null;
        // Keep the same object when the user hasn't changed (e.g. token refresh)
        // so the profile effect doesn't re-run.
        return prev?.id === next?.id ? prev : next;
      });
      setAal(tokenAal(session?.access_token));
      setSessionLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (!sessionLoaded) return;

    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      setReady(true);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    (async () => {
      const p = await fetchProfile(user);
      if (cancelled) return;

      // Disabled accounts are signed out immediately.
      if (p && p.status !== "Active") {
        await supabase.auth.signOut();
        return;
      }

      setProfile(p);
      setProfileLoading(false);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionLoaded]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setProfile(await fetchProfile(user));
  }, [user]);

  const loading = !sessionLoaded || profileLoading;

  return (
    // ✅ Expose profile so sidebar & table use the SAME data
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, aal, loading, refreshProfile }}>
      {ready && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
