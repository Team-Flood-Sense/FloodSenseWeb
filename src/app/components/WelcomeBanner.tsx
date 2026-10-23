import { motion } from 'motion/react';
import { MapPin, ShieldCheck, Waves } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(new Date())) % 24;
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeBanner() {
  const { profile, role } = useAuth();
  const rawName = (profile?.name || 'there').split(' ')[0];
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden p-8"
      style={{
        borderRadius: '28px',
        background: '#1E6FA8',
        boxShadow: '0 8px 24px rgba(var(--shadow-rgb), 0.14)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Decorative waves */}
      <svg className="absolute bottom-0 left-0 w-full h-16 pointer-events-none" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,60 Q240,20 480,55 T960,50 T1440,45 L1440,100 L0,100 Z" fill="rgba(255,255,255,0.04)" />
        <path d="M0,75 Q300,45 600,72 T1200,68 T1440,70 L1440,100 L0,100 Z" fill="rgba(255,255,255,0.03)" />
      </svg>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-white/70 text-sm" style={{ fontWeight: 600 }}>{greeting()},</p>
          <h1 className="text-white text-3xl mt-0.5 truncate" style={{ fontWeight: 800, letterSpacing: '-0.015em' }}>
            {firstName}
          </h1>
          <p className="text-white/75 text-sm mt-2 max-w-xl">
            Flood-monitoring overview for Barangay Pamplona 3.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { icon: ShieldCheck, text: role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member' },
            { icon: MapPin, text: 'Pamplona 3, Las Piñas' },
            { icon: Waves, text: 'Monitoring' },
          ].map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="inline-flex items-center gap-2 px-4 h-9 rounded-full text-white text-xs"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)', fontWeight: 600 }}
            >
              <Icon size={14} />
              {text}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
