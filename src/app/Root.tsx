import { Outlet } from 'react-router';
import { GlassmorphicSidebar } from './components/GlassmorphicSidebar';

export function Root() {
  return (
    <div
      className="h-screen overflow-hidden p-6 flex gap-6"
      style={{ background: '#F4F9FB' }}
    >
      <GlassmorphicSidebar />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}