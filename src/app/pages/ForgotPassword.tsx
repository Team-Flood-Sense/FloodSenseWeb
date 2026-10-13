import { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { supabase } from '@/lib/supabase';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // The email link signs the user in and lands on /change-password
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/change-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      switch (err.code) {
        case 'email_address_invalid':
        case 'validation_failed':
          setError('Please enter a valid email address.');
          break;
        case 'over_email_send_rate_limit':
        case 'over_request_rate_limit':
          setError('Too many requests. Please wait a moment and try again.');
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f2027 0%, #1a1f2e 100%)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          background: 'rgb(var(--surface-rgb))',
          borderRadius: '24px',
          padding: '40px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate('/signin')}
          className="flex items-center gap-2 mb-6 text-sm"
          style={{ color: 'rgba(var(--ink-rgb), 0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} />
          Back to Sign In
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div style={{
            width: '64px', height: '64px',
            background: 'rgba(13, 148, 136, 0.1)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={28} color="#0d9488" />
          </div>
        </div>

        <h2 style={{ fontWeight: 700, fontSize: '22px', color: 'rgb(var(--ink-rgb))',
          textAlign: 'center', marginBottom: '8px' }}>
          Forgot Password
        </h2>
        <p style={{ color: 'rgba(var(--ink-rgb), 0.6)', fontSize: '14px',
          textAlign: 'center', marginBottom: '28px' }}>
          Enter your email and we'll send you a reset link
        </p>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="reset-email" style={{ fontSize: '13px', fontWeight: 600,
                color: 'rgba(var(--ink-rgb), 0.85)', display: 'block', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                placeholder="e.g. juan@floodsense.ph"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  borderRadius: '12px', border: '1px solid rgba(var(--ink-rgb), 0.18)',
                  fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'rgba(var(--ink-rgb), 0.04)', color: 'rgb(var(--ink-rgb))',
                }}
              />
            </div>

            {/* ✅ Error message */}
            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px',
                marginBottom: '12px', fontWeight: 500 }}>
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              style={{
                width: '100%', padding: '13px',
                background: loading || !email ? '#99d4d0' : '#0d9488',
                color: 'white', border: 'none', borderRadius: '12px',
                fontWeight: 700, fontSize: '15px',
                cursor: loading || !email ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <div style={{
            textAlign: 'center', padding: '20px',
            background: 'rgba(13, 148, 136, 0.08)',
            borderRadius: '12px', border: '1px solid rgba(13, 148, 136, 0.2)',
          }}>
            <p style={{ color: '#0d9488', fontWeight: 600, fontSize: '14px' }}>
              ✅ Reset link sent to {email}
            </p>
            <p style={{ color: 'rgba(var(--ink-rgb), 0.6)', fontSize: '13px', marginTop: '6px' }}>
              If an account exists for this email, you'll receive a link shortly. Please check your inbox.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}