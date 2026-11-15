import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Folder, Gauge, PlusCircle, Star } from 'lucide-react';
import type {
  DrivingProfile,
  GameVersion,
  SavedSetup,
  SetupFolder,
} from '../types/setup';
import type { LocalAiBrain } from '../engine/setupAi';
import { GAME_VERSIONS } from '../engine/specs';
import type { AppRoute } from '../components/NavigationShell';

interface HomePageProps {
  preferredGameVersion: GameVersion;
  profiles: Record<GameVersion, DrivingProfile>;
  folders: SetupFolder[];
  setups: SavedSetup[];
  aiBrain: LocalAiBrain;
  liveAiActivity: string;
  onNavigate: (route: AppRoute) => void;
  onOpenFolder: (folderId: string) => void;
  onOpenSetup: (setupId: string, tab?: 'setup' | 'ai' | 'feedback' | 'history') => void;
  onLaunchWizard: (gameVersion: GameVersion) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  preferredGameVersion,
  profiles,
  folders,
  setups,
  aiBrain,
  liveAiActivity,
  onNavigate,
  onOpenFolder,
  onOpenSetup,
  onLaunchWizard,
}) => {
  const activeProfile = profiles[preferredGameVersion];
  const lastSetup = setups[0] ?? null;
  const favourites = setups.filter((s) => s.isFavourite).slice(0, 3);

  return (
    <div className="space-y-3.5">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="liquid-glass-navy rounded-[28px] p-5 text-white"
      >
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#93C5FD] uppercase">
          F1 25 · 2025 &amp; 2026 Pack
        </div>

        <h1 className="mt-2 text-[22px] font-bold tracking-tight leading-tight">
          Personal Setup Garage
        </h1>

        <p className="mt-1 text-xs text-white/80 leading-relaxed">
          {setups.length === 0
            ? 'Start fresh and build your own setup flow.'
            : `${setups.length} saved setup${setups.length === 1 ? '' : 's'} across ${folders.length} folders.`}
        </p>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className="ios-press flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#0A2558] shadow-sm cursor-pointer min-h-[46px]"
          >
            <PlusCircle className="w-4 h-4 text-[#007AFF] shrink-0" />
            <span>New Setup</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="ios-press inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 border border-white/20 px-3.5 py-3 text-[13px] font-semibold text-white cursor-pointer min-h-[46px]"
          >
            <Gauge className="w-4 h-4 shrink-0" />
            <span>Style</span>
          </button>
        </div>

        {!activeProfile.wizardCompleted && (
          <button
            type="button"
            onClick={() => onLaunchWizard(preferredGameVersion)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#EBF3FF] px-3 py-2.5 text-[12px] font-bold text-[#0A2558] min-h-[40px] cursor-pointer"
          >
            Calibrate Driving Style
          </button>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.08 }}
        className="ios-card rounded-[24px] p-4 space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#0A192F]">Folders</h2>
          <button
            type="button"
            onClick={() => onNavigate('setups')}
            className="text-xs font-semibold text-[#007AFF] cursor-pointer"
          >
            Manage
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {folders.map((folder) => {
            const count = setups.filter((s) => s.folderId === folder.id).length;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => onOpenFolder(folder.id)}
                className="ios-press flex items-center justify-between gap-2 rounded-2xl bg-[#F2F2F7] hover:bg-[#E5E7EB]/70 px-3 py-2.5 text-left cursor-pointer min-h-[48px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-4 h-4 text-[#007AFF] shrink-0" />
                  <span className="text-xs font-bold text-[#0A192F] truncate">{folder.name}</span>
                </div>
                <span className="font-mono-tabular text-xs font-bold text-[#64748B] shrink-0">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </motion.section>

      {lastSetup ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.14 }}
          className="ios-card rounded-[24px] p-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-[#0A192F]">Latest Setup</h2>
            <button
              type="button"
              onClick={() => onNavigate('setups')}
              className="text-xs font-semibold text-[#007AFF] cursor-pointer"
            >
              All ({setups.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenSetup(lastSetup.id)}
            className="ios-press mt-2.5 w-full pt-2.5 border-t border-black/[0.06] text-left cursor-pointer flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-[11px] text-[#526581]">
                {GAME_VERSIONS[lastSetup.gameVersion].shortLabel} · {lastSetup.weather.toUpperCase()} · v
                {lastSetup.currentVersion}
              </div>
              <div className="mt-0.5 text-sm font-bold text-[#0A192F] truncate">
                {lastSetup.title}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
          </button>
        </motion.section>
      ) : null}

      {favourites.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.18 }}
          className="ios-card rounded-[24px] p-4"
        >
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-[#007AFF] fill-[#007AFF]" />
            <h2 className="text-[13px] font-bold text-[#0A192F]">Pinned Favourites</h2>
          </div>
          <div className="mt-2 divide-y divide-black/[0.06]">
            {favourites.map((fav) => (
              <button
                key={fav.id}
                type="button"
                onClick={() => onOpenSetup(fav.id)}
                className="ios-press w-full py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer min-h-[44px]"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0A192F] truncate">{fav.title}</div>
                  <div className="text-[11px] text-[#64748B]">
                    {fav.circuitName} · v{fav.currentVersion}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
              </button>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
};
