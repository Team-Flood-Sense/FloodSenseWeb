import { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: any) {
      switch (err.code) {
        case 'auth/user-not-found':
          setError('No account found with this email.');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address.');
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
          background: 'white',
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
          style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
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

        <h2 style={{ fontWeight: 700, fontSize: '22px', color: '#0f172a',
          textAlign: 'center', marginBottom: '8px' }}>
          Forgot Password
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px',
          textAlign: 'center', marginBottom: '28px' }}>
          Enter your email and we'll send you a reset link
        </p>

        {!sent ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600,
                color: '#374151', display: 'block', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                type="email"
                placeholder="e.g. juan@floodsense.ph"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  borderRadius: '12px', border: '1px solid #e5e7eb',
                  fontSize: '14px', outline: 'none', boxSizing: 'border-box',
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
              onClick={handleSubmit}
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
          </>
        ) : (
          <div style={{
            textAlign: 'center', padding: '20px',
            background: 'rgba(13, 148, 136, 0.08)',
            borderRadius: '12px', border: '1px solid rgba(13, 148, 136, 0.2)',
          }}>
            <p style={{ color: '#0d9488', fontWeight: 600, fontSize: '14px' }}>
              ✅ Reset link sent to {email}
            </p>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '6px' }}>
              Please check your inbox
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}