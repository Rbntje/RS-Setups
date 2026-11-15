import React from 'react';
import { motion } from 'motion/react';
import {
  Bot,
  ChevronRight,
  Folder,
  Gauge,
  PlusCircle,
  Sparkles,
  Star,
} from 'lucide-react';
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
      {/* iOS Hero Action Card */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="liquid-glass-navy rounded-[28px] p-5 text-white"
      >
        <div className="text-[11px] font-semibold tracking-wide text-[#93C5FD]">
          EA Sports F1 25 · 2025 &amp; 2026 Pack
        </div>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight leading-tight">
          Personal Setup Garage
        </h1>
        <p className="mt-1 text-xs text-white/80 leading-relaxed">
          {setups.length === 0
            ? 'Start from scratch. Generate a setup, fine-tune every value, and save it into folders.'
            : `${setups.length} saved setup${setups.length === 1 ? '' : 's'} organized across ${folders.length} folders.`}
        </p>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('create')}
            className="ios-press flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#0A2558] shadow-sm cursor-pointer min-h-[46px]"
          >
            <PlusCircle className="w-4 h-4 text-[#007AFF] shrink-0" />
            <span>New Setup</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="ios-press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-white/15 border border-white/25 px-3.5 py-3 text-[13px] font-semibold text-white cursor-pointer min-h-[46px]"
          >
            <Gauge className="w-4 h-4 shrink-0" />
            <span>Style</span>
          </button>
        </div>
      </motion.section>

      {/* Live Self-Coded AI Pill */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.04 }}
        className="ios-card rounded-[22px] p-3.5 flex items-center justify-between gap-3"
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-[#EBF3FF] flex items-center justify-center text-[#007AFF] shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A192F]">
              <span>RS Coded AI</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-[#526581] truncate">
              {aiBrain.learnedInteractions > 0
                ? `${aiBrain.learnedInteractions} learned · ${liveAiActivity}`
                : liveAiActivity}
            </p>
          </div>
        </div>

        {lastSetup ? (
          <button
            type="button"
            onClick={() => onOpenSetup(lastSetup.id, 'ai')}
            className="ios-press shrink-0 rounded-full bg-[#007AFF] px-3.5 py-2 text-[11px] font-bold text-white cursor-pointer min-h-[34px]"
          >
            Ask AI
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="ios-press shrink-0 rounded-full bg-[#F2F2F7] px-3 py-2 text-[11px] font-semibold text-[#007AFF] cursor-pointer min-h-[34px]"
          >
            Live
          </button>
        )}
      </motion.section>

      {/* Optional Calibration Card when uncalibrated */}
      {!activeProfile.wizardCompleted && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.08 }}
          className="ios-card rounded-[22px] p-4 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#007AFF]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Calibrate Driving Style</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#526581] leading-snug">
              Optional 2-min quiz so generated setups match how you drive.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLaunchWizard(preferredGameVersion)}
            className="ios-press shrink-0 rounded-xl bg-[#EBF3FF] px-3.5 py-2 text-xs font-bold text-[#007AFF] min-h-[38px] cursor-pointer"
          >
            Start
          </button>
        </motion.section>
      )}

      {/* Default 2025 / 2026 & Custom Folders Strip */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.1 }}
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

      {/* Recent or Empty Scratch State */}
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
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.14 }}
          className="ios-card rounded-[24px] p-5 text-center space-y-2"
        >
          <div className="text-sm font-bold text-[#0A192F]">Your Garage is Clean</div>
          <p className="text-xs text-[#526581] leading-relaxed">
            No pre-loaded clutter. Tap <strong>New Setup</strong> above to generate, tweak, name,
            and store your first setup in <strong>2025</strong>, <strong>2026</strong>, or your own folder.
          </p>
        </motion.section>
      )}

      {/* Favourites (only rendered when user actually starred setups!) */}
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
