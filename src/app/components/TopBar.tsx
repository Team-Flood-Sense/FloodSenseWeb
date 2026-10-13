import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Clock, MapPin } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const PAGES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Flood monitoring overview' },
  '/sensors': { title: 'Sensor Status', subtitle: 'Station health and readings' },
  '/users': { title: 'User Management', subtitle: 'Team members and permissions' },
  '/sms-logs': { title: 'SMS Blast Logs', subtitle: 'Emergency communication trail' },
  '/residents': { title: 'Residents', subtitle: 'SMS alert recipients' },
};

const TZ = 'Asia/Manila';

export function TopBar() {
  const { pathname } = useLocation();
  const page = PAGES[pathname] ?? PAGES['/'];
  const [now, setNow] = useState(() => new Date());

  // Refresh the clock every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const time = now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

  const chip = {
    background: 'rgba(var(--surface-rgb), 0.7)',
    border: '1px solid rgba(var(--ink-rgb), 0.1)',
    boxShadow: '0 2px 10px rgba(var(--shadow-rgb), 0.06)',
  } as const;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 shrink-0">
      <div className="min-w-0">
        <p className="text-xs text-ink/50 flex items-center gap-1.5" style={{ fontWeight: 600, letterSpacing: '0.04em' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#2EC4B6]" />
          FLOODSENSE <span className="text-ink/30">/</span> {page.title.toUpperCase()}
        </p>
        <h2 className="text-ink text-2xl truncate" style={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
          {page.title}
          <span className="text-ink/45 text-sm ml-3" style={{ fontWeight: 500, letterSpacing: 0 }}>{page.subtitle}</span>
        </h2>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="hidden lg:flex items-center gap-2 px-4 h-9 rounded-full text-ink/80 text-xs" style={{ ...chip, fontWeight: 600 }}>
          <MapPin size={14} className="text-[#2EC4B6]" />
          Barangay Pamplona 3
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 h-9 rounded-full text-ink/80 text-xs" style={{ ...chip, fontWeight: 600 }}>
          <Clock size={14} className="text-[#2EC4B6]" />
          {date} · {time}
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
