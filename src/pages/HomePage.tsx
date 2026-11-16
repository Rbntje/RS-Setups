import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronRight,
  Folder,
  FolderKanban,
  FolderPlus,
  Gauge,
  Plus,
  Star,
} from 'lucide-react';
import type {
  DrivingProfile,
  GameVersion,
  SavedSetup,
  SetupFolder,
} from '../types/setup';
import { GAME_VERSIONS } from '../engine/specs';
import type { AppRoute } from '../components/NavigationShell';

interface HomePageProps {
  preferredGameVersion: GameVersion;
  profiles: Record<GameVersion, DrivingProfile>;
  folders: SetupFolder[];
  setups: SavedSetup[];
  onNavigate: (route: AppRoute) => void;
  onOpenFolder: (folderId: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onOpenSetup: (setupId: string, tab?: 'setup' | 'ai' | 'feedback' | 'history') => void;
  onLaunchWizard: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  preferredGameVersion,
  profiles,
  folders,
  setups,
  onNavigate,
  onOpenFolder,
  onCreateFolder,
  onOpenSetup,
  onLaunchWizard,
}) => {
  const activeProfile = profiles[preferredGameVersion];
  const isCalibrated = activeProfile.wizardCompleted;
  const activeSpecLabel = preferredGameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Cars';
  const lastSetup = setups[0] ?? null;
  const favourites = setups.filter((s) => s.isFavourite).slice(0, 3);

  const [showQuickFolder, setShowQuickFolder] = useState(false);
  const [quickFolderName, setQuickFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const handleQuickFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickFolderName.trim();
    if (!trimmed) {
      setFolderError('Enter a folder name.');
      return;
    }
    setFolderError(null);
    try {
      await onCreateFolder(trimmed);
      setQuickFolderName('');
      setShowQuickFolder(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Could not create folder.');
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Seamless Centered Editorial Title Flowing Up Behind Dynamic Island (No Description) */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="hero-island-pt pb-1 flex items-center justify-center"
      >
        <h1 className="inline-flex items-center justify-center select-none">
          <span className="text-[28px] font-extrabold tracking-[-0.035em] text-[#0A192F] leading-none">
            RS <span className="text-[#007AFF]">Setups</span>
          </span>
        </h1>
      </motion.header>

      {/* Primary Dark Carbon Pitwall Launch Card */}
      <motion.section
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.03 }}
        className="relative rounded-[28px] bg-gradient-to-br from-[#0B162C] via-[#13294B] to-[#0B4F9E] p-5 text-white shadow-[0_20px_40px_-14px_rgba(11,22,44,0.45)] overflow-hidden border border-white/10"
      >
        {/* Subtle Kerb Stripe Accent */}
        <div
          className="absolute left-0 top-5 bottom-5 w-[3.5px] rounded-r-full bg-[#EF4444]"
          aria-hidden="true"
        />

        <div className="pl-2 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-white/12 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-white/95">
                F1 25
              </span>
              <span className="text-xs font-semibold text-blue-100/90">
                {activeSpecLabel}
              </span>
            </div>
            <span className="font-mono-tabular text-[11px] font-semibold text-blue-100/80">
              {setups.length} {setups.length === 1 ? 'setup' : 'setups'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/[0.08] px-2.5 py-2.5 border border-white/[0.08]">
              <div className="font-mono-tabular text-sm font-bold text-white">24</div>
              <div className="text-[10px] font-medium text-blue-100/75">Circuits</div>
            </div>
            <div className="rounded-2xl bg-white/[0.08] px-2.5 py-2.5 border border-white/[0.08]">
              <div className="font-mono-tabular text-sm font-bold text-white">21</div>
              <div className="text-[10px] font-medium text-blue-100/75">Parameters</div>
            </div>
            <div className="rounded-2xl bg-white/[0.08] px-2.5 py-2.5 border border-white/[0.08]">
              <div className="font-mono-tabular text-sm font-bold text-white">{folders.length}</div>
              <div className="text-[10px] font-medium text-blue-100/75">Folders</div>
            </div>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.965 }}
            transition={{ type: 'spring', stiffness: 460, damping: 26 }}
            onClick={() => onNavigate('create')}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-[13.5px] font-bold text-[#0A192F] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.3)] cursor-pointer min-h-[48px]"
          >
            <Plus className="w-4 h-4 text-[#007AFF] stroke-[2.6] shrink-0" />
            <span>New Setup</span>
          </motion.button>
        </div>
      </motion.section>

      {/* Bento Row: Show Calibration ONLY while uncalibrated; once calibrated, hide it completely */}
      <AnimatePresence>
        {!isCalibrated ? (
          <motion.div
            key="bento-with-calibration"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.06 }}
            className="grid grid-cols-2 gap-3"
          >
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onLaunchWizard}
              className="ios-card rounded-[24px] p-4 text-left flex flex-col justify-between min-h-[112px] cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="w-8 h-8 rounded-2xl bg-[#EBF3FF] text-[#007AFF] flex items-center justify-center shrink-0">
                  <Gauge className="w-4 h-4" />
                </span>
                <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
              </div>
              <div className="mt-3">
                <div className="text-[13px] font-bold text-[#0A192F] leading-tight">
                  Driving Style
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-[#007AFF]">
                  Start Quick Quiz
                </div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onNavigate('setups')}
              className="ios-card rounded-[24px] p-4 text-left flex flex-col justify-between min-h-[112px] cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="w-8 h-8 rounded-2xl bg-[#F2F2F7] text-[#0A192F] flex items-center justify-center shrink-0">
                  <FolderKanban className="w-4 h-4" />
                </span>
                <span className="font-mono-tabular text-base font-extrabold text-[#0A192F]">
                  {setups.length}
                </span>
              </div>
              <div className="mt-3">
                <div className="text-[13px] font-bold text-[#0A192F] leading-tight">
                  All Setups
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#64748B]">
                  Browse garage
                </div>
              </div>
            </motion.button>
          </motion.div>
        ) : (
          <motion.button
            key="bento-calibrated-setups"
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('setups')}
            className="ios-card rounded-[24px] p-4 w-full flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-2xl bg-[#F2F2F7] text-[#0A192F] flex items-center justify-center shrink-0">
                <FolderKanban className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-[#0A192F] leading-tight">
                  All Setups
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#64748B]">
                  Browse saved garage
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono-tabular text-base font-extrabold text-[#0A192F]">
                {setups.length}
              </span>
              <ChevronRight className="w-4 h-4 text-[#8E8E93]" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Folders Card (2025 / 2026 + Custom with Quick + Folder) */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28, delay: 0.1 }}
        className="ios-card rounded-[26px] p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold text-[#0A192F]">Folders</h2>
          <motion.button
            type="button"
            whileTap={{ scale: 0.93 }}
            onClick={() => {
              setShowQuickFolder((v) => !v);
              setFolderError(null);
            }}
            aria-label="Create new folder"
            className="inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] hover:bg-[#DCEBFF] px-3 py-1 text-[11px] font-bold text-[#007AFF] cursor-pointer"
          >
            <FolderPlus className="w-3 h-3" />
            <span>{showQuickFolder ? 'Cancel' : '+ Folder'}</span>
          </motion.button>
        </div>

        <AnimatePresence>
          {showQuickFolder && (
            <motion.form
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onSubmit={handleQuickFolderSubmit}
              className="overflow-hidden"
            >
              <div className="flex gap-2 pb-0.5">
                <input
                  type="text"
                  aria-label="Quick folder name"
                  value={quickFolderName}
                  onChange={(e) => setQuickFolderName(e.target.value)}
                  placeholder="Folder name (e.g. League)..."
                  className="flex-1 min-w-0 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F] min-h-[38px]"
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.95 }}
                  className="rounded-2xl bg-[#007AFF] px-3.5 py-2 text-xs font-bold text-white min-h-[38px] cursor-pointer shrink-0"
                >
                  Add
                </motion.button>
              </div>
              {folderError && (
                <p className="text-[11px] font-medium text-red-600 mt-1">{folderError}</p>
              )}
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2">
          {folders.map((folder, index) => {
            const count = setups.filter((s) => s.folderId === folder.id).length;
            return (
              <motion.button
                key={folder.id}
                type="button"
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 26,
                  delay: 0.03 + Math.min(index * 0.03, 0.14),
                }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.955 }}
                onClick={() => onOpenFolder(folder.id)}
                className="flex items-center justify-between gap-2 rounded-2xl bg-[#F2F2F7] hover:bg-[#EBF3FF]/80 px-3 py-2.5 text-left cursor-pointer min-h-[50px] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-white shadow-xs flex items-center justify-center shrink-0">
                    <Folder className="w-3.5 h-3.5 text-[#007AFF]" />
                  </span>
                  <span className="text-xs font-bold text-[#0A192F] truncate">{folder.name}</span>
                </div>
                <span className="font-mono-tabular text-xs font-bold text-[#64748B] shrink-0">
                  {count}
                </span>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* Latest Setup (only rendered when setups exist) */}
      {lastSetup && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.14 }}
          className="ios-card rounded-[26px] p-4"
        >
          <h2 className="text-[13px] font-bold text-[#0A192F]">Latest Setup</h2>
          <motion.button
            type="button"
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onOpenSetup(lastSetup.id)}
            className="mt-2 w-full pt-2 border-t border-black/[0.06] text-left cursor-pointer flex items-center justify-between gap-2"
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
          </motion.button>
        </motion.section>
      )}

      {/* Pinned Favourites (only rendered when user starred setups) */}
      {favourites.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.18 }}
          className="ios-card rounded-[26px] p-4"
        >
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-[#007AFF] fill-[#007AFF]" />
            <h2 className="text-[13px] font-bold text-[#0A192F]">Favourites</h2>
          </div>
          <div className="mt-2 divide-y divide-black/[0.06]">
            {favourites.map((fav) => (
              <motion.button
                key={fav.id}
                type="button"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenSetup(fav.id)}
                className="w-full py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer min-h-[44px]"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0A192F] truncate">{fav.title}</div>
                  <div className="text-[11px] text-[#64748B]">
                    {fav.circuitName} · v{fav.currentVersion}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
};
