import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { GlassmorphicSidebar } from './components/GlassmorphicSidebar';
import { TopBar } from './components/TopBar';
import { preloadPages } from './pages/loaders';

export function Root() {
  // Warm up every tab's code so switching tabs is instant
  useEffect(() => {
    preloadPages();
  }, []);

  return (
    <div className="app-bg h-screen overflow-hidden p-6 flex gap-6">
      <GlassmorphicSidebar />
      <div className="flex-1 min-w-0 flex flex-col gap-6 overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
