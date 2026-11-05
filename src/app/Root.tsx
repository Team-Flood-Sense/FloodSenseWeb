import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Menu } from 'lucide-react';
import { GlassmorphicSidebar } from './components/GlassmorphicSidebar';
import { TopBar } from './components/TopBar';
import { preloadPages } from './pages/loaders';

export function Root() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Warm up every tab's code so switching tabs is instant
  useEffect(() => {
    preloadPages();
  }, []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="app-bg h-dvh overflow-hidden p-3 sm:p-4 lg:p-6 flex gap-6">
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <GlassmorphicSidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col gap-4 lg:gap-6 overflow-hidden">
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setNavOpen(true)}
            className="lg:hidden shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-ink"
            style={{
              background: 'rgba(var(--surface-rgb), 0.7)',
              border: '1px solid rgba(var(--ink-rgb), 0.1)',
            }}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <TopBar />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
