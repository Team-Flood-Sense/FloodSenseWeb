import { useNavigate } from 'react-router';
import { ShieldX } from 'lucide-react';

export function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F9FB]">
      <div className="text-center p-8">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <ShieldX className="text-red-500" size={32} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-6">
          You don't have permission to view this page.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-lg bg-[#0ea5e9] text-white font-semibold hover:bg-[#0284c7] transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}