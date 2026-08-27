import { useState, useRef, KeyboardEvent } from "react";
import { motion } from "motion/react";
import { ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export function TwoFactorAuth() {
  const navigate = useNavigate();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    // Only allow numbers
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError("");

    // Auto-focus next input
    if (value !== "" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    // Auto-focus previous input on backspace if current is empty
    if (e.key === "Backspace" && otp[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6).split("");
    if (pastedData.some(char => !/^\d$/.test(char))) return;

    const newOtp = [...otp];
    pastedData.forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
    
    // Focus the last filled input or the very last input
    const focusIndex = Math.min(pastedData.length, 5);
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

    try {
      // ⏳ Simulate a network request taking 1.5 seconds
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 🛠️ THE MOCK: Only accept "123456" as the correct code
      if (code === "123456") {
        console.log("Mock 2FA successful!");
        // ✅ Give them the VIP pass to bypass the ProtectedRoute
        sessionStorage.setItem('2fa_verified', 'true'); 
        navigate("/"); 
      } else {
        throw new Error("Invalid verification code. Please try again.");
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
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
          onClick={() => navigate(-1)}
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
          <h2 className="text-2xl text-white font-bold mb-2 tracking-tight">Two-Step Verification</h2>
          <p className="text-white/60 text-sm px-4">
            We've sent a 6-digit verification code to your registered device. Enter it below to continue.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="flex justify-center gap-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
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
                Verify Identity
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}