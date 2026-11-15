import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  PlusCircle,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import type { SavedSetup, SetupFolder } from '../types/setup';
import { GAME_VERSIONS } from '../engine/specs';

export type SetupSortOption = 'newest' | 'name' | 'circuit' | 'fit' | 'favourites';

interface MySetupsPageProps {
  folders: SetupFolder[];
  selectedFolderId: string;
  onSelectFolder: (folderId: string) => void;
  setups: SavedSetup[];
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onOpenSetup: (setupId: string) => void;
  onToggleFavourite: (setupId: string) => Promise<void>;
  onDeleteSetup: (setupId: string) => Promise<void>;
  onCreateNew: () => void;
}

export const MySetupsPage: React.FC<MySetupsPageProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  setups,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenSetup,
  onToggleFavourite,
  onDeleteSetup,
  onCreateNew,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SetupSortOption>('newest');
  const [onlyFavourites, setOnlyFavourites] = useState(false);

  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of folders) map.set(f.id, f.name);
    return map;
  }, [folders]);

  const activeCustomFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId && !f.systemDefault) ?? null,
    [folders, selectedFolderId]
  );

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = setups.filter((s) => {
      if (selectedFolderId !== 'all' && s.folderId !== selectedFolderId) return false;
      if (onlyFavourites && !s.isFavourite) return false;
      if (q) {
        const folderLabel = folderNameById.get(s.folderId) ?? '';
        const hay = `${s.title} ${s.circuitName} ${s.sessionType} ${s.weather} ${folderLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'circuit') return a.circuitName.localeCompare(b.circuitName);
      if (sortBy === 'fit') return b.analysis.compatibilityScore - a.analysis.compatibilityScore;
      if (sortBy === 'favourites') {
        if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [setups, selectedFolderId, onlyFavourites, search, sortBy, folderNameById]);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFolderError(null);
    if (!newFolderName.trim()) {
      setFolderError('Enter a folder name.');
      return;
    }
    try {
      await onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setShowAddFolder(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Could not create folder.');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingFolderId || !renameText.trim()) return;
    try {
      await onRenameFolder(renamingFolderId, renameText.trim());
      setRenamingFolderId(null);
      setRenameText('');
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Could not rename folder.');
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#0A192F]">Folders &amp; Setups</h1>
          <p className="text-xs text-[#526581]">
            {setups.length} setup{setups.length === 1 ? '' : 's'} · {folders.length} folders
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="ios-press inline-flex items-center gap-1.5 rounded-full bg-[#007AFF] px-3.5 py-2 text-xs font-bold text-white shadow-sm min-h-[38px] cursor-pointer whitespace-nowrap"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New</span>
        </button>
      </div>

      {/* Folders Strip (2025, 2026 + Custom Folders) */}
      <section className="ios-card rounded-[24px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-bold text-[#0A192F]">Folders</div>
          <button
            type="button"
            onClick={() => {
              setShowAddFolder((v) => !v);
              setFolderError(null);
            }}
            className="ios-press inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] px-3 py-1 text-[11px] font-bold text-[#007AFF] cursor-pointer min-h-[30px]"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{showAddFolder ? 'Cancel' : '+ Folder'}</span>
          </button>
        </div>

        {showAddFolder && (
          <form onSubmit={handleAddFolder} className="flex gap-2">
            <input
              type="text"
              aria-label="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name (e.g. Spa Wet, League)..."
              className="flex-1 min-w-0 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F] min-h-[40px]"
            />
            <button
              type="submit"
              className="ios-press rounded-2xl bg-[#007AFF] px-3.5 py-2 text-xs font-bold text-white min-h-[40px] cursor-pointer shrink-0"
            >
              Add
            </button>
          </form>
        )}

        {folderError && (
          <p className="text-[11px] font-medium text-red-600">{folderError}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectFolder('all')}
            className={`ios-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer min-h-[34px] ${
              selectedFolderId === 'all'
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'bg-[#F2F2F7] text-[#334155]'
            }`}
          >
            <span>All</span>
            <span className="font-mono-tabular text-[11px] opacity-80">{setups.length}</span>
          </button>

          {folders.map((folder) => {
            const count = setups.filter((s) => s.folderId === folder.id).length;
            const active = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  onSelectFolder(folder.id);
                  setRenamingFolderId(null);
                }}
                className={`ios-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer min-h-[34px] ${
                  active
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#F2F2F7] text-[#334155]'
                }`}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span>{folder.name}</span>
                <span className="font-mono-tabular text-[11px] opacity-80">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Custom folder rename/delete controls */}
        {activeCustomFolder && (
          <div className="pt-2 border-t border-black/[0.06]">
            {renamingFolderId === activeCustomFolder.id ? (
              <form onSubmit={handleRenameSubmit} className="flex gap-2">
                <input
                  type="text"
                  aria-label="Rename folder"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  className="flex-1 min-w-0 rounded-xl bg-[#F2F2F7] px-3 py-1.5 text-xs min-h-[36px]"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#007AFF] px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                >
                  Save
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-[#526581]">
                <span>Custom folder: {activeCustomFolder.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingFolderId(activeCustomFolder.id);
                      setRenameText(activeCustomFolder.name);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#007AFF] cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Rename</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeleteFolder(activeCustomFolder.id);
                      onSelectFolder('all');
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Search & Sort Toolbar */}
      <div className="ios-card rounded-[24px] p-3.5 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8E8E93] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search setup name, circuit, folder..."
            aria-label="Search setups"
            className="w-full rounded-2xl bg-[#F2F2F7] pl-9 pr-3 py-2 text-xs text-[#0A192F] min-h-[40px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="relative flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#64748B] absolute left-3 pointer-events-none" />
            <select
              aria-label="Sort setups"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SetupSortOption)}
              className="w-full rounded-2xl bg-[#F2F2F7] pl-8 pr-2.5 py-2 text-xs font-semibold text-[#0A192F] min-h-[40px]"
            >
              <option value="newest">Sort: Newest</option>
              <option value="name">Sort: Name A–Z</option>
              <option value="circuit">Sort: Circuit A–Z</option>
              <option value="fit">Sort: Best Fit %</option>
              <option value="favourites">Sort: Favourites First</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setOnlyFavourites((v) => !v)}
            aria-pressed={onlyFavourites}
            className={`ios-press w-full inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold min-h-[40px] cursor-pointer ${
              onlyFavourites
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'bg-[#F2F2F7] text-[#334155]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyFavourites ? 'fill-white' : ''}`} />
            <span>Favourites</span>
          </button>
        </div>
      </div>

      {/* Results List */}
      {filteredAndSorted.length === 0 ? (
        <div className="ios-card rounded-[24px] p-7 text-center space-y-2">
          <FolderOpen className="w-7 h-7 text-[#8E8E93] mx-auto" />
          <h2 className="text-sm font-bold text-[#0A192F]">
            {setups.length === 0 ? 'No setups yet' : 'No matching setups'}
          </h2>
          <p className="text-xs text-[#526581] leading-relaxed">
            {setups.length === 0
              ? 'Your garage starts clean. Create your first setup, customize its parameters, and organize it into folders.'
              : 'Clear your search or pick another folder.'}
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="ios-press mt-2 inline-flex items-center gap-1.5 rounded-2xl bg-[#007AFF] px-4 py-2.5 text-xs font-bold text-white min-h-[42px] cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Setup</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredAndSorted.map((setup, idx) => {
            const folderLabel = folderNameById.get(setup.folderId) ?? '2025';
            return (
              <motion.div
                key={setup.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28, delay: Math.min(idx * 0.03, 0.2) }}
                className="ios-card rounded-[22px] p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenSetup(setup.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-[#526581]">
                      <span className="rounded-md bg-[#EBF3FF] px-1.5 py-0.5 text-[10px] font-bold text-[#007AFF]">
                        {folderLabel}
                      </span>
                      <span>
                        {GAME_VERSIONS[setup.gameVersion].shortLabel} · {setup.weather.toUpperCase()} · v
                        {setup.currentVersion}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-bold text-[#0A192F] truncate">
                      {setup.title}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleFavourite(setup.id)}
                      aria-label={
                        setup.isFavourite
                          ? `Remove ${setup.title} from favourites`
                          : `Favourite ${setup.title}`
                      }
                      className="ios-press w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#007AFF] cursor-pointer"
                    >
                      <Star className={`w-4 h-4 ${setup.isFavourite ? 'fill-[#007AFF]' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSetup(setup.id)}
                      aria-label={`Delete ${setup.title}`}
                      className="ios-press w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#8E8E93] hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenSetup(setup.id)}
                  className="mt-2.5 w-full pt-2.5 border-t border-black/[0.06] flex items-center justify-between text-xs font-mono-tabular cursor-pointer"
                >
                  <div className="flex items-center gap-3 text-[#526581]">
                    <span>
                      Aero {setup.parameters.frontWingAero}/{setup.parameters.rearWingAero}
                    </span>
                    <span>
                      Diff {setup.parameters.diffAdjustmentOnThrottle}%/{setup.parameters.diffAdjustmentOffThrottle}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1 font-bold text-[#007AFF]">
                    <span>{setup.analysis.compatibilityScore}% fit</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
