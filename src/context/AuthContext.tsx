import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Role = "admin" | "operator" | "viewer" | null;

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: string;
  location: string;
  photoURL?: string;
  lastActive: any;
}

interface AuthContextType {
  user: any;
  profile: UserProfile | null; // ✅ full Firestore profile
  role: Role;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        const userRef = doc(db, "users", firebaseUser.uid);

        // ✅ FIX 1: Update lastActive on every login
        await updateDoc(userRef, {
          lastActive: serverTimestamp(),
        });

        // ✅ FIX 2: Fetch full Firestore profile
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRole(data.role);
          setProfile({
            uid: firebaseUser.uid,
            name: data.name || firebaseUser.displayName || "Unknown",
            email: data.email || firebaseUser.email || "",
            phone: data.phone || "",
            role: data.role,
            status: data.status || "active",
            location: data.location || "",
            photoURL: data.photoURL || firebaseUser.photoURL || "",
            lastActive: data.lastActive,
          });
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    // ✅ FIX 3: Expose profile so sidebar & table use the SAME data
    <AuthContext.Provider value={{ user, profile, role, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);