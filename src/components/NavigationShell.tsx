import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Download,
  FolderKanban,
  Gauge,
  HardDrive,
  Home,
  PlusCircle,
  RotateCcw,
  Settings,
  Sparkles,
} from 'lucide-react';
import { IpaDownloadCard } from './IpaDownloadCard';
import { formatStorageBytes, type StorageBreakdown } from '../storage/storageOptimizer';

export type AppRoute =
  | 'home'
  | 'create'
  | 'setups'
  | 'details'
  | 'profile'
  | 'library'
  | 'settings';

interface NavigationShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  setupCount: number;
  folderCount: number;
  activeVersionLabel: string;
  storageStats: StorageBreakdown;
  liveAiActivity: string;
  savedGithubRepo: string;
  onSaveGithubRepo: (repo: string) => Promise<void>;
  onRunAdminOptimize: () => Promise<void>;
  onExportBackup: () => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  activeSetupId?: string | null;
  children: React.ReactNode;
}

const TAB_ITEMS: Array<{
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'create', label: 'Create', icon: PlusCircle },
  { id: 'setups', label: 'Setups', icon: FolderKanban },
  { id: 'profile', label: 'Style', icon: Gauge },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ROUTE_TITLES: Record<AppRoute, string> = {
  home: '',
  create: 'New Setup',
  setups: 'Setups',
  details: 'Setup',
  profile: 'Driving Style',
  library: 'Library',
  settings: 'Settings',
};

export const NavigationShell: React.FC<NavigationShellProps> = ({
  activeRoute,
  onNavigate,
  setupCount,
  folderCount,
  activeVersionLabel,
  storageStats,
  liveAiActivity,
  savedGithubRepo,
  onSaveGithubRepo,
  onRunAdminOptimize,
  onExportBackup,
  onResetWorkspace,
  activeSetupId,
  children,
}) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [adminMsg, setAdminMsg] = React.useState<string | null>(null);

  const effectiveTab =
    activeRoute === 'details'
      ? 'setups'
      : activeRoute === 'library'
        ? 'settings'
        : activeRoute;

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeRoute, activeSetupId]);

  const showBackButton = activeRoute === 'details' || activeRoute === 'library';
  const backTarget: AppRoute = activeRoute === 'details' ? 'setups' : 'settings';
  const isHome = activeRoute === 'home';

  const handleAdminOptimize = async () => {
    await onRunAdminOptimize();
    setAdminMsg('AI memory organized & trimmed.');
    setTimeout(() => setAdminMsg(null), 2600);
  };

  const handleAdminReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    await onResetWorkspace();
    setConfirmReset(false);
    setAdminMsg('Reset to clean scratch state.');
    setTimeout(() => setAdminMsg(null), 2600);
  };

  return (
    <div className="ios-canvas min-h-[100dvh] lg:min-h-screen flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-10 lg:px-8 lg:py-4 text-[#0A192F]">
      {/* Desktop Website Companion & Admin Panel (Phone preview is always 393px iPhone format) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-80 lg:shrink-0 lg:self-stretch lg:justify-between py-2">
        <div className="space-y-3.5">
          <div className="ios-card rounded-[26px] p-4 space-y-3">
            <div className="min-w-0">
              <div className="text-lg font-extrabold tracking-tight text-[#0A192F]">
                RS <span className="text-[#007AFF]">Setups</span>
              </div>
              <div className="text-xs text-[#526581]">
                iPhone Edition · 100% On-Device
              </div>
            </div>

            <div className="pt-2.5 border-t border-black/[0.06] grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] font-medium text-[#64748B]">Setups</div>
                <div className="font-mono-tabular text-sm font-bold text-[#0A192F]">
                  {setupCount}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] font-medium text-[#64748B]">Folders</div>
                <div className="font-mono-tabular text-sm font-bold text-[#0A192F]">
                  {folderCount}
                </div>
              </div>
              <div className="rounded-2xl bg-[#EBF3FF] py-2 px-1">
                <div className="text-[10px] font-medium text-[#0B4F9E]">Spec</div>
                <div className="text-xs font-bold text-[#0A2558] mt-0.5 truncate px-1">
                  {activeVersionLabel.includes('2026') ? '2026 Pack' : '2025 Cars'}
                </div>
              </div>
            </div>
          </div>

          <IpaDownloadCard
            variant="sidebar"
            savedRepo={savedGithubRepo}
            onSaveRepo={onSaveGithubRepo}
          />

          <div className="ios-card rounded-[26px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A192F] min-w-0">
                <HardDrive className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
                <span className="truncate">Admin &amp; Storage</span>
              </div>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#007AFF] whitespace-nowrap shrink-0">
                {formatStorageBytes(storageStats.totalBytes)} / 200 MB
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#0B4F9E] to-[#007AFF]"
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.max(2, Math.min(100, storageStats.percentUsed))}%`,
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              />
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-[11px] text-[#334155]">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007AFF] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#007AFF]" />
              </span>
              <span className="truncate">{liveAiActivity}</span>
            </div>

            {adminMsg && (
              <div className="rounded-xl bg-[#EBF3FF] px-3 py-1.5 text-[11px] font-semibold text-[#0B4F9E]">
                {adminMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => void handleAdminOptimize()}
                className="ios-press inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#EBF3FF] px-2.5 py-2 text-[11px] font-semibold text-[#0B4F9E] hover:bg-[#DCEBFF] cursor-pointer min-h-[36px]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Organize</span>
              </button>
              <button
                type="button"
                onClick={() => void onExportBackup()}
                className="ios-press inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F2F2F7] px-2.5 py-2 text-[11px] font-semibold text-[#0A192F] hover:bg-[#E5E7EB] cursor-pointer min-h-[36px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleAdminReset()}
              className={`ios-press w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold min-h-[36px] cursor-pointer ${
                confirmReset
                  ? 'bg-red-600 text-white'
                  : 'bg-[#FFF1F2] text-red-700 hover:bg-red-100'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{confirmReset ? 'Tap Again to Wipe All' : 'Reset Garage'}</span>
            </button>
          </div>
        </div>

        <nav className="ios-card rounded-[24px] p-2.5 space-y-1" aria-label="Phone quick navigation">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = effectiveTab === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate(item.id)}
                className={`relative z-0 w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors min-h-[38px] cursor-pointer ${
                  active ? 'text-white' : 'text-[#334155] hover:bg-[#F2F2F7]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="desktop-nav-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 rounded-2xl bg-[#007AFF] shadow-sm -z-10"
                  />
                )}
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </motion.button>
            );
          })}
        </nav>
      </aside>

      {/* Center Stage: Edge-to-Edge iPhone Canvas up through Dynamic Island */}
      <div className="w-full h-[100dvh] lg:w-[409px] lg:h-[min(844px,calc(100vh-28px))] lg:rounded-[52px] lg:p-[8px] lg:bg-gradient-to-b lg:from-[#27272A] lg:via-[#18181B] lg:to-[#09090B] lg:shadow-[0_36px_90px_-16px_rgba(10,25,47,0.45),0_0_0_1px_rgba(255,255,255,0.22)] shrink-0 flex flex-col">
        <div className="flex-1 flex flex-col min-h-0 ios-canvas lg:rounded-[44px] overflow-hidden relative">
          {/* Floating Transparent Status Bar & Dynamic Island (App UI flows completely behind top bezel) */}
          <div
            className="hidden lg:flex items-center justify-between px-7 pt-3 pb-1 absolute top-0 inset-x-0 z-30 pointer-events-none select-none transition-colors text-[#0A192F]"
            aria-hidden="true"
          >
            <span className="font-mono-tabular text-[11px] font-bold">9:41</span>
            <motion.div
              animate={{
                width: activeRoute === 'create' ? 116 : activeRoute === 'details' ? 106 : 96,
              }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              className="h-[24px] rounded-full bg-[#09090B] flex items-center justify-end pr-2 shadow-inner"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-pulse" />
            </motion.div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold">5G</span>
              <span className="inline-block w-4 h-2.5 rounded-[3px] border border-[#0A192F] p-[1px]">
                <span className="block w-full h-full rounded-[1px] bg-[#0A192F]" />
              </span>
            </div>
          </div>

          {/* Sub-pages Translucent Liquid Glass Header extending all the way behind Dynamic Island */}
          {!isHome && (
            <header className="shrink-0 header-island-pt pb-2 px-4 bg-white/75 backdrop-blur-2xl border-b border-black/[0.06] z-20">
              <div className="flex items-center justify-between gap-2 h-9">
                {showBackButton ? (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onNavigate(backTarget)}
                    className="inline-flex items-center gap-0.5 -ml-1.5 px-2 py-1 rounded-xl text-[13px] font-semibold text-[#007AFF] min-h-[36px] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4 stroke-[2.4]" />
                    <span>Back</span>
                  </motion.button>
                ) : (
                  <div className="w-12 shrink-0" aria-hidden="true" />
                )}

                <motion.h1
                  key={activeRoute}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="text-[15px] font-bold tracking-tight text-[#0A192F] truncate"
                >
                  {ROUTE_TITLES[activeRoute]}
                </motion.h1>

                <div className="w-12 shrink-0" aria-hidden="true" />
              </div>
            </header>
          )}

          {/* Edge-to-Edge Scrollable Viewport (Home flows behind top bezel, all pages flow cleanly past dock) */}
          <main
            ref={scrollContainerRef}
            className={`flex-1 overflow-y-auto phone-scroll pb-24 ${
              isHome ? 'px-3.5 pt-0' : 'px-3.5 pt-3'
            }`}
          >
            <motion.div
              key={`${activeRoute}-${activeSetupId ?? 'none'}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </main>

          {/* Floating Liquid Glass iOS Dock */}
          <nav
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 safe-pb px-2.5 pb-2.5 lg:pb-2.5 pt-4 bg-gradient-to-t from-[#f2f2f7]/95 via-[#f2f2f7]/55 to-transparent"
            aria-label="Mobile navigation"
          >
            <div className="pointer-events-auto rounded-[30px] bg-white/84 backdrop-blur-2xl border border-white/95 shadow-[0_14px_34px_-8px_rgba(10,25,47,0.22),inset_0_1px_0_rgba(255,255,255,1)] p-1 grid grid-cols-5 items-center gap-0.5">
              {TAB_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = effectiveTab === item.id;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative z-0 flex flex-col items-center justify-center min-h-[54px] py-1.5 rounded-[26px] cursor-pointer transition-colors ${
                      isActive ? 'text-[#007AFF]' : 'text-[#8E8E93] hover:text-[#0A192F]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="ios-dock-pill"
                        transition={{ type: 'spring', stiffness: 480, damping: 30 }}
                        className="absolute inset-0 rounded-[25px] bg-gradient-to-b from-[#007AFF]/18 to-[#007AFF]/10 border border-[#007AFF]/22 shadow-[inset_0_1px_1px_rgba(255,255,255,0.85)] -z-10"
                      />
                    )}
                    <motion.div
                      animate={{
                        scale: isActive ? 1.12 : 1,
                        y: isActive ? -1 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 460, damping: 22 }}
                    >
                      <Icon className={`w-[21px] h-[21px] ${isActive ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                    </motion.div>
                    <span
                      className={`text-[10.5px] tracking-tight mt-0.5 whitespace-nowrap ${
                        isActive ? 'font-bold' : 'font-medium'
                      }`}
                    >
                      {item.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Subtle iOS Home Indicator */}
            <div className="hidden lg:flex items-center justify-center pt-1.5" aria-hidden="true">
              <div className="w-28 h-1 rounded-full bg-black/25" />
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
};
