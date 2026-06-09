import { Outlet } from 'react-router-dom';
import BottomNav  from './BottomNav.jsx';
import CommandBar from './CommandBar.jsx';

export default function MobileLayout({ cmdBar, alertCount = 0 }) {
  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>

      {/* AI command bar — top of every screen */}
      <CommandBar bar={cmdBar} />

      {/* Page content */}
      <main className="flex-1 overflow-y-auto px-4 pb-6 animate-fadeIn">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <BottomNav alertCount={alertCount} />
    </div>
  );
}
