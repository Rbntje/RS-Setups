import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
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
import { BrandMark } from './BrandMark';
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
  home: 'RS Setups',
  create: 'New Setup',
  setups: 'Folders & Setups',
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
        ? 'home'
        : activeRoute;

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeRoute, activeSetupId]);

  const showBackButton = activeRoute === 'details' || activeRoute === 'library';
  const backTarget: AppRoute = activeRoute === 'details' ? 'setups' : 'home';

  const handleAdminOptimize = async () => {
    await onRunAdminOptimize();
    setAdminMsg('AI memory organized.');
    setTimeout(() => setAdminMsg(null), 2200);
  };

  const handleAdminReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    await onResetWorkspace();
    setConfirmReset(false);
    setAdminMsg('Garage reset.');
    setTimeout(() => setAdminMsg(null), 2200);
  };

  return (
    <div className="ios-canvas min-h-[100dvh] flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-10 lg:px-8 lg:py-4 text-[#0A192F]">
      <aside className="hidden lg:flex lg:flex-col lg:w-80 lg:shrink-0 lg:self-stretch lg:justify-between py-2">
        <div className="space-y-3.5">
          <div className="ios-card rounded-[26px] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <BrandMark size="md" />
              <div className="min-w-0">
                <div className="text-base font-bold tracking-tight">RS Setups</div>
                <div className="text-xs text-[#526581]">iPhone Edition · 100% on-device</div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-black/[0.06] grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] font-medium text-[#64748B]">Setups</div>
                <div className="font-mono-tabular text-sm font-bold text-[#0A192F]">{setupCount}</div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] font-medium text-[#64748B]">Folders</div>
                <div className="font-mono-tabular text-sm font-bold text-[#0A192F]">{folderCount}</div>
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
        </div>

        <nav className="ios-card rounded-[24px] p-2.5 space-y-1" aria-label="Phone quick navigation">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = effectiveTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`ios-press w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold transition-colors min-h-[38px] cursor-pointer ${
                  active
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'text-[#334155] hover:bg-[#F2F2F7]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="w-full h-[100dvh] lg:w-[409px] lg:h-[min(844px,calc(100vh-28px))] lg:rounded-[52px] lg:p-[8px] lg:bg-gradient-to-b lg:from-[#27272A] lg:via-[#18181B] lg:to-[#09090B] lg:shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div className="flex-1 flex flex-col min-h-0 ios-canvas lg:rounded-[44px] overflow-hidden relative">
          <div
            className="hidden lg:flex items-center justify-between px-7 pt-3 pb-1 shrink-0 select-none"
            aria-hidden="true"
          >
            <span className="font-mono-tabular text-[11px] font-bold text-[#0A192F]">9:41</span>
            <motion.div
              animate={{ width: activeRoute === 'create' ? 114 : 96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="h-[22px] rounded-full bg-[#09090B] flex items-center justify-end pr-2 shadow-inner"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-pulse" />
            </motion.div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#0A192F]">5G</span>
              <span className="inline-block w-4 h-2.5 rounded-[3px] border border-[#0A192F] p-[1px]">
                <span className="block w-full h-full bg-[#0A192F] rounded-[1px]" />
              </span>
            </div>
          </div>

          <header className="shrink-0 safe-pt px-4 pt-2 pb-2 bg-white/75 backdrop-blur-2xl border-b border-black/[0.06] z-20">
            <div className="flex items-center justify-between gap-2 h-10">
              {showBackButton ? (
                <button
                  type="button"
                  onClick={() => onNavigate(backTarget)}
                  className="ios-press inline-flex items-center gap-0.5 -ml-1.5 px-2 py-1.5 rounded-xl text-[13px] font-semibold text-[#007AFF] min-h-[40px] cursor-pointer whitespace-nowrap"
                >
                  <ChevronLeft className="w-4 h-4 stroke-[2.4]" />
                  <span>Back</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="ios-press inline-flex items-center gap-2 min-w-0 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <BrandMark size="sm" />
                  <span className="text-[14px] font-bold tracking-tight text-[#0A192F]">RS Setups</span>
                </button>
              )}

              <div className="text-[14px] font-semibold text-[#0A192F] truncate">
                {activeRoute === 'home' ? '' : ROUTE_TITLES[activeRoute]}
              </div>

              <button
                type="button"
                onClick={() => onNavigate(activeRoute === 'library' ? 'create' : 'library')}
                aria-label={activeRoute === 'library' ? 'New Setup' : 'Open Setup Library'}
                className="ios-press inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] min-h-[34px] cursor-pointer whitespace-nowrap"
              >
                {activeRoute === 'library' ? (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>New</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Library</span>
                  </>
                )}
              </button>
            </div>
          </header>

          <main
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto phone-scroll px-3.5 pt-3 pb-5"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeRoute}-${activeSetupId ?? 'none'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          <nav
            className="shrink-0 safe-pb bg-white/85 backdrop-blur-2xl border-t border-black/[0.06] z-20"
            aria-label="Mobile navigation"
          >
            <div className="grid grid-cols-5 items-center h-[60px] px-1.5">
              {TAB_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = effectiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`ios-press relative flex flex-col items-center justify-center min-h-[46px] rounded-2xl cursor-pointer ${
                      isActive ? 'text-[#007AFF]' : 'text-[#8E8E93] hover:text-[#0A192F]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="ios-tab-highlight"
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-x-2 inset-y-1 rounded-2xl bg-[#007AFF]/10 -z-10"
                      />
                    )}
                    <Icon className={`w-[21px] h-[21px] ${isActive ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                    <span
                      className={`text-[10.5px] tracking-tight mt-0.5 whitespace-nowrap ${
                        isActive ? 'font-bold' : 'font-medium'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="hidden lg:flex items-center justify-center pb-1.5" aria-hidden="true">
              <div className="w-32 h-1 rounded-full bg-black/25" />
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
};
