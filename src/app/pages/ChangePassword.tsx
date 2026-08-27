import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function ChangePassword() {
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ old: '', new: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    // Validation
    if (!form.old || !form.new || !form.confirm) {
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

    setLoading(true);

    try {
      const user = auth.currentUser;

      if (!user || !user.email) {
        setError('No user is currently logged in.');
        return;
      }

      // Re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, form.old);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, form.new);

      setSuccess('Password updated successfully!');
      setForm({ old: '', new: '', confirm: '' });

      // Redirect to signin after 2 seconds
      setTimeout(() => navigate('/signin'), 2000);

    } catch (err: any) {
      switch (err.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Current password is incorrect.');
          break;
        case 'auth/weak-password':
          setError('New password is too weak.');
          break;
        case 'auth/too-many-requests':
          setError('Too many attempts. Please try again later.');
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const Field = ({
    label, value, show, onToggle, onChange, placeholder
  }: {
    label: string; value: string; show: boolean;
    onToggle: () => void; onChange: (v: string) => void; placeholder: string;
  }) => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '13px', fontWeight: 600,
        color: '#374151', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', padding: '12px 44px 12px 16px',
            borderRadius: '12px', border: '1px solid #e5e7eb',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
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
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-6 text-sm"
          style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
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

        <h2 style={{ fontWeight: 700, fontSize: '22px', color: '#0f172a',
          textAlign: 'center', marginBottom: '8px' }}>
          Change Password
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px',
          textAlign: 'center', marginBottom: '28px' }}>
          Update your account password
        </p>

        <Field
          label="Current Password"
          value={form.old}
          show={showOld}
          onToggle={() => setShowOld(!showOld)}
          onChange={v => setForm({ ...form, old: v })}
          placeholder="Enter current password"
        />
        <Field
          label="New Password"
          value={form.new}
          show={showNew}
          onToggle={() => setShowNew(!showNew)}
          onChange={v => setForm({ ...form, new: v })}
          placeholder="Enter new password"
        />
        <Field
          label="Confirm New Password"
          value={form.confirm}
          show={showConfirm}
          onToggle={() => setShowConfirm(!showConfirm)}
          onChange={v => setForm({ ...form, confirm: v })}
          placeholder="Confirm new password"
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
          onClick={handleSubmit}
          disabled={loading}
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
      </motion.div>
    </div>
  );
}