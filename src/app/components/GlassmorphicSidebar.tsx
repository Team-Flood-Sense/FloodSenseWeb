import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Activity,
  LogOut,
  Waves,
  Users,
  MessageSquare,
  Contact,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useEscape } from "@/app/hooks/useEscape";

export function GlassmorphicSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Uses the Supabase profiles row (same source as the table)
  const { user, profile, role, refreshProfile } = useAuth();
  const displayName = profile?.name || user?.email?.split("@")[0] || "Admin";
  const photoURL = profile?.photoURL || null;

  const allMenuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/", roles: ["admin", "operator", "viewer"] },
    { icon: Activity, label: "Sensor Status", path: "/sensors", roles: ["admin", "operator", "viewer"] },
    { icon: Users, label: "User Management", path: "/users", roles: ["admin"] },
    { icon: MessageSquare, label: "SMS Blast Logs", path: "/sms-logs", roles: ["admin", "operator"] },
    { icon: Contact, label: "Residents", path: "/residents", roles: ["admin", "operator"] },
  ];

  const menuItems = allMenuItems.filter(item => role && item.roles.includes(role));

  const [showProfile, setShowProfile] = useState(false);
  const [name, setName] = useState(profile?.name || displayName);
  const [email, setEmail] = useState(profile?.email || user?.email || "");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Closing always resets the form so stale errors/passwords don't reappear
  const closeProfile = useCallback(() => {
    clearTimeout(closeTimer.current);
    setShowProfile(false);
    setError("");
    setSuccess("");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  useEscape(showProfile, closeProfile);

  async function handleSave() {
    setError("");
    setSuccess("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const wantsPasswordChange = Boolean(oldPassword || newPassword || confirmPassword);

    // Validate everything up front so nothing is half-saved
    if (!trimmedName) {
      setError("Name cannot be empty.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (wantsPasswordChange && !oldPassword) {
      setError("Enter your current password to set a new one.");
      return;
    }
    if (wantsPasswordChange && !newPassword) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!user) return;

    let emailChangePending = false;
    setSaving(true);

    try {
      // 1. Verify the current password before any change that needs it
      if (wantsPasswordChange && user.email) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: oldPassword,
        });
        if (reauthError) throw reauthError;
      }

      // 2. ✅ Update Profile in the profiles table
      if (trimmedName !== profile?.name) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ name: trimmedName })
          .eq("id", user.id);
        if (profileError) throw profileError;
      }

      // 3. Password and email in one Supabase Auth call, so they succeed or
      //    fail together. Email changes send a confirmation link first;
      //    profiles.email syncs automatically once confirmed.
      const authUpdate: { password?: string; email?: string } = {};
      if (wantsPasswordChange) authUpdate.password = newPassword;
      if (trimmedEmail !== user.email) {
        authUpdate.email = trimmedEmail;
        emailChangePending = true;
      }
      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await supabase.auth.updateUser(authUpdate);
        if (authError) throw authError;
      }

      await refreshProfile();

      setSuccess(emailChangePending
        ? "Profile updated! Check your new email to confirm the change."
        : "Profile updated successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      // Close the modal automatically after a short delay
      closeTimer.current = setTimeout(closeProfile, emailChangePending ? 3000 : 1500);

    } catch (err: any) {
      if (err.code === "invalid_credentials") {
        setError("Current password is incorrect.");
      } else if (err.code === "email_exists") {
        setError("That email is already in use by another account.");
      } else if (err.code === "same_password") {
        setError("New password must be different from the current one.");
      } else if (err.code === "weak_password") {
        setError("New password is too weak.");
      } else {
        setError("Something went wrong. Please try again.");
        console.error("Profile update error:", err);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/signin");
  }

  return (
    <>
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="w-72 h-full shrink-0 p-6 relative flex flex-col overflow-y-auto"
        style={{
          background: "var(--sidebar-bg)",
          borderRadius: "28px",
          boxShadow: `inset 0 0 1px 1px rgba(46, 196, 182, 0.3), 0 20px 60px rgba(11, 60, 93, 0.3)`,
          border: "1px solid rgba(46, 196, 182, 0.2)",
        }}
      >
        {/* Inner glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: "28px", boxShadow: "inset 0 0 20px rgba(46, 196, 182, 0.15)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 mb-12">
          <div className="p-3 rounded-2xl" style={{ background: "linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)", boxShadow: "0 8px 20px rgba(46, 196, 182, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)" }}>
            <Waves className="text-white" size={32} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-white text-xl tracking-tight" style={{ fontWeight: 700 }}>FloodSense</h1>
            <p className="text-[#2EC4B6] text-sm" style={{ fontWeight: 500 }}>Command Center</p>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="relative z-10 space-y-2 mb-8">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group ${isActive ? "active-menu-item" : "hover:bg-white/5"}`}
                style={isActive ? {
                  background: "linear-gradient(135deg, rgba(46, 196, 182, 0.2) 0%, rgba(46, 196, 182, 0.1) 100%)",
                  boxShadow: "0 0 20px rgba(46, 196, 182, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(46, 196, 182, 0.3)",
                } : {}}
              >
                <Icon className={isActive ? "text-[#2EC4B6]" : "text-white/70 group-hover:text-white"} size={22} strokeWidth={2.5} />
                <span className={`text-sm ${isActive ? "text-white" : "text-white/70 group-hover:text-white"}`} style={{ fontWeight: isActive ? 600 : 500 }}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="relative z-10 mt-auto pt-6 border-t border-white/10">
          <div className="p-4 rounded-2xl bg-white/5 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#2EC4B6] animate-pulse" />
              <span className="text-white/90 text-sm" style={{ fontWeight: 600 }}>System Online</span>
            </div>
            <p className="text-white/60 text-xs">Dashboard connected</p>
          </div>

          {/* ✅ User Card with Supabase profile data */}
          <button
            onClick={() => {
              // Force the inputs to grab the latest data right before opening
              setName(profile?.name || displayName);
              setEmail(profile?.email || user?.email || "");
              setShowProfile(true);
            }}
            className="w-full p-4 rounded-2xl bg-white/5 mb-2 hover:bg-white/10 transition-all duration-300 text-left"
            style={{ border: "1px solid transparent" }}
            onMouseEnter={e => (e.currentTarget.style.border = "1px solid rgba(46, 196, 182, 0.3)")}
            onMouseLeave={e => (e.currentTarget.style.border = "1px solid transparent")}
          >
            <div className="flex items-center gap-3">
              {/* ✅ Shows photo if available, otherwise initial */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm overflow-hidden"
                style={{ background: "linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)", fontWeight: 700 }}>
                {photoURL
                  ? <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
                  : displayName.charAt(0).toUpperCase()
                }
              </div>
              <div>
                <p className="text-white text-sm" style={{ fontWeight: 600 }}>{displayName}</p>
                <p className="text-[#2EC4B6] text-xs capitalize">{role ?? "No role"}</p>
              </div>
            </div>
          </button>

          {/* Sign Out */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-white/5 transition-all duration-300"
            onClick={handleSignOut}
          >
            <LogOut className="text-white/70" size={20} strokeWidth={2.5} />
            <span className="text-sm text-white/70" style={{ fontWeight: 500 }}>Sign Out</span>
          </button>
        </div>
      </motion.div>

      {/* Profile Modal */}
      {createPortal(
        <AnimatePresence>
          {showProfile && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeProfile}
                style={{
                  position: "fixed", inset: 0, zIndex: 9998,
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)",
                }}
              />

              <div style={{
                position: "fixed", inset: 0, zIndex: 9999,
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}>
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="edit-profile-title"
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    pointerEvents: "all",
                    width: "90%", maxWidth: "440px",
                    maxHeight: "90vh", overflowY: "auto",
                    background: "white",
                    borderRadius: "24px",
                    padding: "32px",
                    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 id="edit-profile-title" style={{ fontWeight: 700, fontSize: "18px", color: "#0f172a" }}>Edit Profile</h2>
                      <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>Update your account information</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={closeProfile}
                      style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <X size={18} color="#64748b" />
                    </button>
                  </div>

                  {/* ✅ Avatar with photo support */}
                  <div className="flex justify-center mb-6">
                    <div>
                      <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "white", fontWeight: 700, overflow: "hidden" }}>
                        {photoURL
                          ? <img src={photoURL} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : displayName.charAt(0).toUpperCase()
                        }
                      </div>
                    </div>
                  </div>

                  {/* Name & Email Fields */}
                  {[
                    { id: "profile-name", label: "Full Name", value: name, onChange: setName, type: "text", placeholder: "e.g. Juan Dela Cruz", autoComplete: "name" },
                    { id: "profile-email", label: "Email Address", value: email, onChange: setEmail, type: "email", placeholder: "e.g. juan@floodsense.ph", autoComplete: "email" },
                  ].map(({ id, label, value, onChange, type, placeholder, autoComplete }) => (
                    <div key={label} style={{ marginBottom: "14px" }}>
                      <label htmlFor={id} style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>{label}</label>
                      <input
                        id={id} type={type} autoComplete={autoComplete} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}

                  {/* Divider */}
                  <div style={{ borderTop: "1px solid #f1f5f9", margin: "16px 0" }} />
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
                    Change Password (optional)
                  </p>

                  {/* Password Fields */}
                  {[
                    { id: "profile-old-password", label: "Current Password", value: oldPassword, onChange: setOldPassword, show: showOld, onToggle: () => setShowOld(!showOld), autoComplete: "current-password" },
                    { id: "profile-new-password", label: "New Password", value: newPassword, onChange: setNewPassword, show: showNew, onToggle: () => setShowNew(!showNew), autoComplete: "new-password" },
                    { id: "profile-confirm-password", label: "Confirm New Password", value: confirmPassword, onChange: setConfirmPassword, show: showConfirm, onToggle: () => setShowConfirm(!showConfirm), autoComplete: "new-password" },
                  ].map(({ id, label, value, onChange, show, onToggle, autoComplete }) => (
                    <div key={label} style={{ marginBottom: "12px" }}>
                      <label htmlFor={id} style={{ fontSize: "13px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "5px" }}>{label}</label>
                      <div style={{ position: "relative" }}>
                        <input
                          id={id} autoComplete={autoComplete} type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} placeholder="••••••••"
                          style={{ width: "100%", padding: "10px 40px 10px 14px", borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                        />
                        <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={onToggle} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                          {show ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Error / Success */}
                  {error && <p style={{ color: "#ef4444", fontSize: "13px", marginBottom: "10px", fontWeight: 500 }}>⚠ {error}</p>}
                  {success && <p style={{ color: "#0d9488", fontSize: "13px", marginBottom: "10px", fontWeight: 500 }}>✅ {success}</p>}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={closeProfile}
                      style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      style={{ flex: 1, padding: "11px", borderRadius: "10px", border: "none", background: saving ? "#99d4d0" : "#0d9488", color: "white", fontWeight: 600, fontSize: "14px", cursor: saving ? "not-allowed" : "pointer" }}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}