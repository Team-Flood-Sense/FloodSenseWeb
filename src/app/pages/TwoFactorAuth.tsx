import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion } from "motion/react";
import { ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

// Real 2FA using Supabase MFA (TOTP authenticator apps such as Google
// Authenticator, Microsoft Authenticator or Authy). Verifying a code raises
// the session to aal2, which the routes and database policies require.

type Mode = "loading" | "enroll" | "verify" | "error";

const EMPTY_OTP = ["", "", "", "", "", ""];

export function TwoFactorAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, aal } = useAuth();

  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Only allow redirects to in-app paths
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  // Find a verified authenticator, or start enrolling a new one.
  useEffect(() => {
    if (!user || aal === "aal2") return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setError("Could not load your two-step verification settings.");
        setMode("error");
        return;
      }

      const verified = data.totp[0];
      if (verified) {
        setFactorId(verified.id);
        setMode("verify");
        return;
      }

      // Clear abandoned enrollments, then enroll a fresh authenticator.
      for (const f of data.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `FloodSense ${new Date().toISOString()}`,
      });
      if (cancelled) return;
      if (enrollError) {
        setError("Could not start authenticator setup. Make sure MFA (TOTP) is enabled in Supabase.");
        setMode("error");
        return;
      }
      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode("enroll");
    })();

    return () => {
      cancelled = true;
    };
  }, [user, aal]);

  if (!user) return <Navigate to="/signin" replace />;
  if (aal === "aal2") return <Navigate to={next} replace />;

  const handleChange = (index: number, value: string) => {
    // Only allow numbers; take the last typed digit so overwriting works
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError("");

    // Auto-focus next input
    if (digit !== "" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Auto-focus previous input on backspace if current is empty
    if (e.key === "Backspace" && otp[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\s/g, "").slice(0, 6 - index).split("");
    if (pastedData.length === 0 || pastedData.some(char => !/^\d$/.test(char))) return;

    // Fill from the box that was pasted into
    const newOtp = [...otp];
    pastedData.forEach((char, i) => {
      newOtp[index + i] = char;
    });
    setOtp(newOtp);

    const focusIndex = Math.min(index + pastedData.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");

    if (code.length < 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setIsLoading(true);
    setError("");

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });

    if (error) {
      setError(
        error.code === "mfa_verification_failed"
          ? "Invalid verification code. Please try again."
          : error.code === "over_request_rate_limit"
          ? "Too many attempts. Please wait a moment and try again."
          : "Verification failed. Please try again.",
      );
      setOtp(EMPTY_OTP);
      inputRefs.current[0]?.focus();
      setIsLoading(false);
      return;
    }

    // ✅ Sign-in fully completed: record it as the user's last activity
    await supabase.from("profiles").update({ last_active: new Date().toISOString() }).eq("id", user.id);
    navigate(next, { replace: true });
  };

  // Leaving 2FA ends the half-finished sign-in
  const handleBack = async () => {
    await supabase.auth.signOut();
    navigate("/signin", { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        background: 'linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)',
      }}
    >
      {/* Background ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(46,196,182,0.05) 0%, rgba(0,0,0,0) 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md p-8 relative z-10"
        style={{
          background: "rgba(11, 60, 93, 0.4)",
          backdropFilter: "blur(20px)",
          borderRadius: "28px",
          boxShadow: `inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 20px 60px rgba(0, 0, 0, 0.4)`,
          border: "1px solid rgba(46, 196, 182, 0.1)",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to sign in"
          className="absolute top-6 left-6 text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex flex-col items-center text-center mb-8 mt-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{
              background: "linear-gradient(135deg, rgba(46,196,182,0.2) 0%, rgba(46,196,182,0.05) 100%)",
              border: "1px solid rgba(46,196,182,0.3)",
              boxShadow: "0 8px 20px rgba(46,196,182,0.15)"
            }}
          >
            <ShieldCheck className="text-[#2EC4B6]" size={32} strokeWidth={2} />
          </div>
          <h2 className="text-2xl text-white font-bold mb-2 tracking-tight">
            {mode === "enroll" ? "Set Up Two-Step Verification" : "Two-Step Verification"}
          </h2>
          <p className="text-white/60 text-sm px-4">
            {mode === "enroll"
              ? "Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy), then enter the 6-digit code it shows."
              : mode === "verify"
              ? "Open your authenticator app and enter the 6-digit code for FloodSense."
              : mode === "loading"
              ? "Loading…"
              : ""}
          </p>
        </div>

        {mode === "enroll" && (
          <div className="flex flex-col items-center mb-8">
            <div className="bg-white p-3 rounded-2xl">
              <img src={qrCode} alt="Authenticator QR code" width={180} height={180} />
            </div>
            <p className="text-white/50 text-xs mt-3">Can't scan? Enter this key manually:</p>
            <code className="text-[#2EC4B6] text-xs mt-1 break-all text-center select-all">{secret}</code>
          </div>
        )}

        {mode === "error" ? (
          <p className="text-[#ef4444] text-sm text-center font-medium">{error}</p>
        ) : mode !== "loading" && (
          <form onSubmit={handleVerify} className="space-y-8">
            <div className="flex justify-center gap-3">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${index + 1}`}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={(e) => handlePaste(index, e)}
                  className="w-12 h-14 text-center text-xl font-bold text-white rounded-xl outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: digit ? "1px solid rgba(46, 196, 182, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
                    boxShadow: digit ? "0 0 15px rgba(46, 196, 182, 0.1)" : "none",
                  }}
                />
              ))}
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[#ef4444] text-sm text-center font-medium"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={isLoading || otp.join("").length < 6}
              className="w-full py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
              style={{
                background: "linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)",
                color: "white",
                fontWeight: 600,
                boxShadow: "0 8px 20px rgba(46, 196, 182, 0.3)",
              }}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === "enroll" ? "Activate & Continue" : "Verify Identity"}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
