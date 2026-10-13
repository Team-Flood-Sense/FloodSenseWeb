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
  const firstName = (profile?.name || 'there').split(' ')[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden p-8"
      style={{
        borderRadius: '28px',
        background: 'linear-gradient(120deg, #0B3C5D 0%, #1D70A2 58%, #2EC4B6 130%)',
        boxShadow: '0 16px 44px rgba(var(--shadow-rgb), 0.22), inset 0 1px 2px rgba(255, 255, 255, 0.18)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
      }}
    >
      {/* Decorative rings */}
      <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.14)' }} />
      <div className="absolute -right-4 -top-12 w-48 h-48 rounded-full pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'radial-gradient(circle, rgba(46,196,182,0.22), transparent 70%)' }} />

      {/* Decorative waves */}
      <svg className="absolute bottom-0 left-0 w-full h-16 pointer-events-none" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,60 Q240,20 480,55 T960,50 T1440,45 L1440,100 L0,100 Z" fill="rgba(255,255,255,0.07)" />
        <path d="M0,75 Q300,45 600,72 T1200,68 T1440,70 L1440,100 L0,100 Z" fill="rgba(255,255,255,0.06)" />
      </svg>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-white/70 text-sm" style={{ fontWeight: 600 }}>{greeting()},</p>
          <h1 className="text-white text-3xl mt-0.5 truncate" style={{ fontWeight: 800, letterSpacing: '-0.015em' }}>
            {firstName} 👋
          </h1>
          <p className="text-white/75 text-sm mt-2 max-w-xl">
            Here's the flood-monitoring overview for Barangay Pamplona 3. Keep an eye on the water level and rainfall below.
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
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', fontWeight: 600 }}
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
