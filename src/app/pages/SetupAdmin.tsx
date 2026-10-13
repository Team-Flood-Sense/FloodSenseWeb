import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// First-run setup: creates the first admin account when none exists yet.
// The bootstrap-admin Edge Function enforces this server-side.

const inputClass =
  'w-full px-4 py-2.5 rounded-lg bg-[#0f1923] border border-[#2a3f55] text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors';

export function SetupAdmin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('admin_exists').then(({ data, error }) => {
      if (error) setError('Could not reach the server. Make sure the database migrations have been run.');
      setSetupOpen(!error && data === false);
      setChecking(false);
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: fnError } = await supabase.functions.invoke('bootstrap-admin', {
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password },
      });
      if (fnError) {
        let message = 'Could not reach the bootstrap-admin function. Check your internet connection and that it is deployed.';
        if (fnError instanceof FunctionsHttpError) {
          message = `The server returned an error (${fnError.context.status}).`;
          try {
            const body = await fnError.context.json();
            if (fnError.context.status === 404) {
              message = 'The bootstrap-admin function is not deployed in this Supabase project (or has a different name).';
            } else {
              message = body.error || body.message || message;
            }
          } catch { /* non-JSON response */ }
        }
        throw new Error(message);
      }

      // Account is stored in Supabase; sign in and continue to 2FA setup.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (signInError) {
        navigate('/signin', { replace: true });
        return;
      }
      navigate('/2fa', { replace: true });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  const fields = [
    { key: 'name', label: 'Full Name', type: 'text', placeholder: 'e.g. Juan Dela Cruz', autoComplete: 'name' },
    { key: 'email', label: 'Email Address', type: 'email', placeholder: 'admin@floodsense.ph', autoComplete: 'email' },
    { key: 'password', label: 'Password', type: 'password', placeholder: 'At least 8 characters', autoComplete: 'new-password' },
    { key: 'confirm', label: 'Confirm Password', type: 'password', placeholder: 'Repeat password', autoComplete: 'new-password' },
  ] as const;

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#0f1923]">
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-[#1a2a3a] border border-[#2a3f55] rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <h1 className="text-2xl font-bold text-white tracking-wide">FloodSense Setup</h1>
            <p className="text-sm text-slate-400 mt-1 text-center">Create the first administrator account</p>
          </div>

          {checking ? (
            <p className="text-center text-slate-400 text-sm">Checking setup status…</p>
          ) : !setupOpen ? (
            <div className="space-y-5 text-center">
              <p className="text-slate-300 text-sm">
                {error || 'Setup is already complete. An administrator account exists; ask an admin to create your account.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="w-full py-2.5 rounded-lg bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-semibold transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              {fields.map(({ key, label, type, placeholder, autoComplete }) => (
                <div key={key} className="space-y-1.5">
                  <label htmlFor={`setup-${key}`} className="text-sm font-medium text-slate-300">{label}</label>
                  <input
                    id={`setup-${key}`}
                    type={type}
                    required
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              ))}

              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-colors mt-2"
              >
                {loading ? 'Creating account…' : 'Create Admin Account'}
              </button>

              <p className="text-center text-xs text-slate-500">
                Next you'll set up an authenticator app for two-step verification.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
