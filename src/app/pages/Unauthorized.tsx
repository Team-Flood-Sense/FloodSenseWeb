import { useNavigate } from 'react-router';
import { ShieldX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export function Unauthorized() {
  const navigate = useNavigate();
  const { role } = useAuth();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/signin');
  }

  return (
    <div className="app-bg min-h-screen flex items-center justify-center">
      <div className="text-center p-8">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <ShieldX className="text-red-500" size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-ink mb-2">Access Denied</h1>
        <p className="text-ink/60 mb-6">
          {role
            ? "You don't have permission to view this page."
            : 'Your account has no role assigned yet. Please contact an administrator.'}
        </p>
        <div className="flex justify-center gap-3">
          {role && (
            <button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-lg bg-[#0ea5e9] text-white font-semibold hover:bg-[#0284c7] transition-colors"
            >
              Back to Dashboard
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="px-6 py-2.5 rounded-lg border border-ink/20 text-ink font-semibold hover:bg-ink/5 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
