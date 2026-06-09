import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Database, Activity, Settings, Zap, PanelLeftClose, PanelLeftOpen, LogOut, ArrowLeftRight, GitBranch, ScrollText, Download, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { settingsService, syncApi } from '../services';
import { EnvironmentsProvider } from '../contexts/EnvironmentsContext';
import TokenGate from './TokenGate';
import AppLoadingSkeleton from './AppLoadingSkeleton';

const NAV_STORAGE_KEY = 'syncdb_nav_collapsed';

const navItems = [
  { to: '/', icon: Activity, label: 'Dashboard' },
  { to: '/compare', icon: ArrowLeftRight, label: 'Compare' },
  { to: '/local-environments', icon: Server, label: 'Local Envs' },
  { to: '/environments', icon: Database, label: 'Environments' },
  { to: '/import', icon: Download, label: 'Import' },
  { to: '/branches', icon: GitBranch, label: 'Branches' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function getInitialCollapsed(): boolean {
  const stored = localStorage.getItem(NAV_STORAGE_KEY);
  if (stored === null) return true;
  return stored === 'true';
}

export default function Layout() {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    settingsService.getSyncToken().then(token => {
      if (token) {
        syncApi.setTokenCache(token);
        setHasToken(true);
      } else {
        setHasToken(false);
      }
    }).catch(() => setHasToken(false));

    settingsService.getSupabaseAccessToken().then(info => {
      if (info.token) {
        syncApi.setSupabaseAccessTokenCache(info.token);
      }
    }).catch(() => {});
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(NAV_STORAGE_KEY, String(next));
      return next;
    });
  }

  function handleConnected() {
    setHasToken(true);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside
        className={`bg-gray-900 border-r border-gray-800 flex flex-col fixed inset-y-0 left-0 z-30 transition-all duration-200 ease-in-out ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        <div className={`h-16 flex items-center border-b border-gray-800 ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-6'}`}>
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="text-white font-semibold text-lg tracking-tight">SyncDB</span>}
        </div>
        <nav className={`flex-1 py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-600/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
                }`
              }
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className={`border-t border-gray-800 ${collapsed ? 'p-2 space-y-1' : 'p-3 space-y-1'}`}>
          <button
            onClick={signOut}
            title={collapsed ? 'Sign out' : undefined}
            className={`flex items-center w-full rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all duration-150 ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
          <button
            onClick={toggleCollapsed}
            className={`flex items-center w-full rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-all duration-150 ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            }`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="w-[18px] h-[18px]" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <main className={`flex-1 transition-all duration-200 ease-in-out ${collapsed ? 'ml-[68px]' : 'ml-64'}`}>
        <div className="px-4 py-6 lg:px-6">
          {hasToken === null ? (
            <AppLoadingSkeleton />
          ) : hasToken ? (
            <EnvironmentsProvider>
              <Outlet />
            </EnvironmentsProvider>
          ) : (
            <TokenGate onConnected={handleConnected} />
          )}
        </div>
      </main>
    </div>
  );
}
