import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { supabase, recovery } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// Defined outside ChangePassword so the inputs keep focus while typing
// (a component declared inside render is remounted on every keystroke).
function Field({
  id, label, value, show, onToggle, onChange, placeholder, autoComplete,
}: {
  id: string; label: string; value: string; show: boolean;
  onToggle: () => void; onChange: (v: string) => void; placeholder: string;
  autoComplete: string;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label htmlFor={id} style={{ fontSize: '13px', fontWeight: 600,
        color: 'rgba(var(--ink-rgb), 0.85)', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '12px 44px 12px 16px',
            borderRadius: '12px', border: '1px solid rgba(var(--ink-rgb), 0.18)',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'rgba(var(--ink-rgb), 0.04)', color: 'rgb(var(--ink-rgb))',
          }}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={onToggle}
          style={{
            position: 'absolute', right: '14px', top: '50%',
            transform: 'translateY(-50%)', background: 'none',
            border: 'none', cursor: 'pointer', color: '#9ca3af',
          }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export function ChangePassword() {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ old: '', new: '', confirm: '' });
  const [error, setError] = useState(recovery.linkError
    ? `This reset link is invalid or has expired (${recovery.linkError}). Please request a new one.`
    : '');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const redirectTimer = useRef<ReturnType<typeof setTimeout>>();

  // Arrived from a reset-password email: the link already proves identity,
  // so the current password isn't required.
  const isRecovery = recovery.isActive();

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  // Accounts with 2FA must complete the authenticator challenge before
  // Supabase allows a password change.
  useEffect(() => {
    if (!user) return;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
        navigate('/2fa?next=/change-password', { replace: true });
      }
    });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if ((!isRecovery && !form.old) || !form.new || !form.confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (form.new !== form.confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (form.new.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!user || !user.email) {
      setError(isRecovery
        ? 'This reset link is invalid or has expired. Please request a new one.'
        : 'Please sign in first to change your password.');
      return;
    }

    setLoading(true);

    try {
      // Re-authenticate first (verifies the current password)
      if (!isRecovery) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: form.old,
        });
        if (reauthError) throw reauthError;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: form.new });
      if (updateError) throw updateError;

      recovery.clear();
      setSuccess('Password updated successfully!');
      setForm({ old: '', new: '', confirm: '' });

      // Sign out and redirect to signin after 2 seconds
      await supabase.auth.signOut();
      redirectTimer.current = setTimeout(() => navigate('/signin'), 2000);

    } catch (err: any) {
      switch (err.code) {
        case 'invalid_credentials':
          setError('Current password is incorrect.');
          break;
        case 'weak_password':
          setError('New password is too weak.');
          break;
        case 'same_password':
          setError('New password must be different from the current one.');
          break;
        case 'insufficient_aal':
          navigate('/2fa?next=/change-password', { replace: true });
          break;
        case 'over_request_rate_limit':
          setError('Too many attempts. Please try again later.');
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
          type="button"
          onClick={() => navigate(user ? '/' : '/signin')}
          className="flex items-center gap-2 mb-6 text-sm"
          style={{ color: 'rgba(var(--ink-rgb), 0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div style={{
            width: '64px', height: '64px',
            background: 'rgba(13, 148, 136, 0.1)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={28} color="#0d9488" />
          </div>
        </div>

        <h2 style={{ fontWeight: 700, fontSize: '22px', color: 'rgb(var(--ink-rgb))',
          textAlign: 'center', marginBottom: '8px' }}>
          {isRecovery ? 'Reset Password' : 'Change Password'}
        </h2>
        <p style={{ color: 'rgba(var(--ink-rgb), 0.6)', fontSize: '14px',
          textAlign: 'center', marginBottom: '28px' }}>
          {isRecovery ? 'Choose a new password for your account' : 'Update your account password'}
        </p>

        <form onSubmit={handleSubmit}>
          {!isRecovery && (
            <Field
              id="current-password"
              label="Current Password"
              value={form.old}
              show={showOld}
              onToggle={() => setShowOld(!showOld)}
              onChange={v => setForm(f => ({ ...f, old: v }))}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          )}
          <Field
            id="new-password"
            label="New Password"
            value={form.new}
            show={showNew}
            onToggle={() => setShowNew(!showNew)}
            onChange={v => setForm(f => ({ ...f, new: v }))}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <Field
            id="confirm-password"
            label="Confirm New Password"
            value={form.confirm}
            show={showConfirm}
            onToggle={() => setShowConfirm(!showConfirm)}
            onChange={v => setForm(f => ({ ...f, confirm: v }))}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />

          {/* Error / Success */}
          {error && (
            <p style={{ color: '#ef4444', fontSize: '13px',
              marginBottom: '12px', fontWeight: 500 }}>
              ⚠ {error}
            </p>
          )}
          {success && (
            <p style={{ color: '#0d9488', fontSize: '13px',
              marginBottom: '12px', fontWeight: 500 }}>
              ✅ {success} Redirecting to sign in...
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !!success}
            style={{
              width: '100%', padding: '13px',
              background: loading ? '#99d4d0' : '#0d9488',
              color: 'white', border: 'none', borderRadius: '12px',
              fontWeight: 700, fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
