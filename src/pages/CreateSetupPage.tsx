import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CloudRain,
  FolderPlus,
  Gauge,
  Minus,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import type {
  DrivingProfile,
  GameVersion,
  SavedSetup,
  SessionType,
  SetupAnalysis,
  SetupFolder,
  SetupParameterKey,
  SetupParameters,
  WeatherType,
} from '../types/setup';
import type { LocalCircuitNote } from '../storage/localStore';
import { getDefaultFolderIdForVersion } from '../storage/localStore';
import {
  CIRCUITS,
  GAME_VERSIONS,
  PARAMETER_ORDER,
  clampAndStep,
  formatParamValue,
} from '../engine/specs';
import { getCircuitById } from '../engine/generator';

interface DraftPreview {
  parameters: SetupParameters;
  analysis: SetupAnalysis;
}

interface CreateSetupPageProps {
  initialGameVersion: GameVersion;
  initialCircuitId: string;
  folders: SetupFolder[];
  profiles: Record<GameVersion, DrivingProfile>;
  circuitNotes: LocalCircuitNote[];
  onSaveCircuitNote: (circuitId: string, gameVersion: GameVersion, note: string) => Promise<void>;
  onGenerateDraft: (payload: {
    gameVersion: GameVersion;
    circuitId: string;
    weather: WeatherType;
    sessionType: SessionType;
    raceTyreFocus?: boolean;
    raceConsistencyFocus?: boolean;
  }) => DraftPreview;
  onSaveSetupDraft: (payload: {
    title: string;
    folderId: string;
    newFolderName?: string;
    gameVersion: GameVersion;
    circuitId: string;
    weather: WeatherType;
    sessionType: SessionType;
    raceTyreFocus?: boolean;
    raceConsistencyFocus?: boolean;
    parameters: SetupParameters;
    analysis: SetupAnalysis;
  }) => Promise<SavedSetup>;
  onCreated: (setup: SavedSetup) => void;
  onEditProfile: (gameVersion: GameVersion) => void;
}

const SECTIONS = [
  'Aerodynamics',
  'Transmission',
  'Suspension Geometry',
  'Suspension',
  'Brakes',
  'Tyres',
] as const;

export const CreateSetupPage: React.FC<CreateSetupPageProps> = ({
  initialGameVersion,
  initialCircuitId,
  folders,
  profiles,
  circuitNotes,
  onSaveCircuitNote,
  onGenerateDraft,
  onSaveSetupDraft,
  onCreated,
  onEditProfile,
}) => {
  const [step, setStep] = useState<'configure' | 'review'>('configure');
  const [gameVersion, setGameVersion] = useState<GameVersion>(initialGameVersion);
  const [circuitId, setCircuitId] = useState<string>(initialCircuitId || 'silverstone');
  const [weather, setWeather] = useState<WeatherType>('dry');
  const [sessionType, setSessionType] = useState<SessionType>('race');
  const [raceTyreFocus, setRaceTyreFocus] = useState(true);
  const [raceConsistencyFocus, setRaceConsistencyFocus] = useState(true);

  const [circuitNote, setCircuitNote] = useState('');
  const [noteSavedMsg, setNoteSavedMsg] = useState<string | null>(null);

  // Step 2: Generated Draft Review & Edit State
  const [draftBaseline, setDraftBaseline] = useState<DraftPreview | null>(null);
  const [editedParams, setEditedParams] = useState<SetupParameters | null>(null);
  const [setupTitle, setSetupTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    getDefaultFolderIdForVersion(initialGameVersion)
  );
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCircuit = getCircuitById(circuitId);
  const activeProfile = profiles[gameVersion];
  const specs = GAME_VERSIONS[gameVersion].parameters;

  useEffect(() => {
    const match = circuitNotes.find(
      (n) => n.gameVersion === gameVersion && n.circuitId === circuitId
    );
    setCircuitNote(match?.note ?? '');
    setNoteSavedMsg(null);
  }, [gameVersion, circuitId, circuitNotes]);

  const scrollMainToTop = () => {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveNote = async () => {
    try {
      await onSaveCircuitNote(circuitId, gameVersion, circuitNote);
      setNoteSavedMsg('Track note saved locally.');
    } catch (err) {
      setNoteSavedMsg(err instanceof Error ? err.message : 'Failed to save note.');
    }
  };

  const handleGeneratePreview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const preview = onGenerateDraft({
      gameVersion,
      circuitId,
      weather,
      sessionType,
      raceTyreFocus: sessionType === 'race' ? raceTyreFocus : false,
      raceConsistencyFocus: sessionType === 'race' ? raceConsistencyFocus : false,
    });
    const yearTag = gameVersion === 'f1_25_2026_pack' ? '2026' : '2025';
    const sessionTag =
      sessionType === 'time_trial'
        ? 'TT'
        : sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
    setDraftBaseline(preview);
    setEditedParams({ ...preview.parameters });
    setSetupTitle(`${activeCircuit.name} ${yearTag} ${sessionTag}`);
    setSelectedFolderId(getDefaultFolderIdForVersion(gameVersion));
    setCreatingNewFolder(false);
    setNewFolderName('');
    setStep('review');
    scrollMainToTop();
  };

  const stepParameter = (key: SetupParameterKey, direction: -1 | 1) => {
    if (!editedParams) return;
    const spec = specs[key];
    const nextVal = clampAndStep(editedParams[key] + direction * spec.step, spec);
    setEditedParams({
      ...editedParams,
      [key]: nextVal,
    });
  };

  const handleResetToAiDraft = () => {
    if (!draftBaseline) return;
    setEditedParams({ ...draftBaseline.parameters });
  };

  const editedCount =
    draftBaseline && editedParams
      ? PARAMETER_ORDER.filter((k) => editedParams[k] !== draftBaseline.parameters[k]).length
      : 0;

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftBaseline || !editedParams) return;
    if (creatingNewFolder && !newFolderName.trim()) {
      setError('Enter a name for your new folder or pick an existing folder.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const saved = await onSaveSetupDraft({
        title: setupTitle.trim(),
        folderId: selectedFolderId,
        newFolderName: creatingNewFolder ? newFolderName.trim() : undefined,
        gameVersion,
        circuitId,
        weather,
        sessionType,
        raceTyreFocus: sessionType === 'race' ? raceTyreFocus : false,
        raceConsistencyFocus: sessionType === 'race' ? raceConsistencyFocus : false,
        parameters: editedParams,
        analysis: draftBaseline.analysis,
      });
      onCreated(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {step === 'configure' ? (
        <motion.form
          key="step-configure"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          onSubmit={handleGeneratePreview}
          className="space-y-3.5"
        >
          <div className="px-0.5">
            <h1 className="text-[22px] font-bold tracking-tight text-[#0A192F]">Create Setup</h1>
            <p className="text-xs text-[#526581]">
              Step 1 of 2 · Generate first, then inspect or adjust every value before saving.
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          {/* 1. Car Spec */}
          <section className="ios-card rounded-[24px] p-4 space-y-2.5">
            <h2 className="text-[13px] font-bold text-[#0A192F]">Car Spec</h2>
            <div className="grid grid-cols-2 gap-2">
              {(['f1_25_2025', 'f1_25_2026_pack'] as const).map((ver) => {
                const spec = GAME_VERSIONS[ver];
                const selected = gameVersion === ver;
                return (
                  <button
                    key={ver}
                    type="button"
                    onClick={() => setGameVersion(ver)}
                    className={`ios-press rounded-2xl p-3 text-left border transition-all min-h-[60px] cursor-pointer ${
                      selected
                        ? 'border-[#007AFF] bg-[#EBF3FF] shadow-sm'
                        : 'border-black/[0.06] bg-[#F2F2F7]/75 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#0A192F]">{spec.shortLabel}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-[#007AFF]" />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#526581]">
                      {ver === 'f1_25_2025' ? '2025 Cars' : '2026 Pack'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Circuit */}
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-bold text-[#0A192F]">Circuit</h2>
              <span className="font-mono-tabular text-[11px] font-semibold text-[#526581]">
                R{activeCircuit.round} · {activeCircuit.lengthKm.toFixed(2)} km
              </span>
            </div>

            <select
              id="circuit-select"
              aria-label="Circuit"
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value)}
              className="w-full rounded-2xl border border-black/[0.08] bg-[#F2F2F7] px-3.5 py-2.5 text-[13px] font-semibold text-[#0A192F] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 min-h-[46px]"
            >
              {CIRCUITS.map((c) => (
                <option key={c.id} value={c.id}>
                  R{String(c.round).padStart(2, '0')} — {c.name} ({c.country})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Aero</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeCircuit.downforceDemand}/10
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Speed</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeCircuit.topSpeedPriority}/10
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Kerbs</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeCircuit.kerbSeverity}/10
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Tyres</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeCircuit.tyreStress}/10
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-black/[0.06] flex gap-2">
              <input
                id="circuit-note"
                type="text"
                aria-label="Personal circuit note"
                value={circuitNote}
                onChange={(e) => setCircuitNote(e.target.value)}
                placeholder={`Note for ${activeCircuit.name}...`}
                className="flex-1 min-w-0 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F] min-h-[42px]"
              />
              <button
                type="button"
                onClick={handleSaveNote}
                className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#EBF3FF] px-3.5 py-2 text-xs font-semibold text-[#007AFF] min-h-[42px] cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Note</span>
              </button>
            </div>
            {noteSavedMsg && <p className="text-[11px] font-medium text-[#007AFF]">{noteSavedMsg}</p>}
          </section>

          {/* 3. Weather & Session */}
          <section className="ios-card rounded-[24px] p-4 space-y-3.5">
            <h2 className="text-[13px] font-bold text-[#0A192F]">Conditions &amp; Session</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWeather('dry')}
                className={`ios-press flex items-center justify-center gap-2 rounded-2xl py-2.5 px-3 text-xs font-bold min-h-[44px] cursor-pointer ${
                  weather === 'dry'
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#F2F2F7] text-[#334155]'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Dry</span>
              </button>
              <button
                type="button"
                onClick={() => setWeather('wet')}
                className={`ios-press flex items-center justify-center gap-2 rounded-2xl py-2.5 px-3 text-xs font-bold min-h-[44px] cursor-pointer ${
                  weather === 'wet'
                    ? 'bg-[#007AFF] text-white shadow-sm'
                    : 'bg-[#F2F2F7] text-[#334155]'
                }`}
              >
                <CloudRain className="w-4 h-4" />
                <span>Wet</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#F2F2F7] rounded-2xl">
              {(
                [
                  { id: 'qualifying', label: 'Quali' },
                  { id: 'race', label: 'Race' },
                  { id: 'time_trial', label: 'TT' },
                  { id: 'practice', label: 'Practice' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSessionType(st.id)}
                  className={`ios-press rounded-xl py-2 px-1.5 text-[11px] font-bold min-h-[38px] cursor-pointer whitespace-nowrap transition-colors ${
                    sessionType === st.id
                      ? 'bg-white text-[#007AFF] shadow-sm'
                      : 'text-[#64748B]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {sessionType === 'race' && (
              <div className="pt-2 border-t border-black/[0.06] space-y-2">
                <label className="flex items-center justify-between gap-2 text-xs text-[#0A192F] cursor-pointer min-h-[36px]">
                  <span>Long-stint tyre protection</span>
                  <input
                    type="checkbox"
                    checked={raceTyreFocus}
                    onChange={(e) => setRaceTyreFocus(e.target.checked)}
                    className="w-4 h-4 accent-[#007AFF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-[#0A192F] cursor-pointer min-h-[36px]">
                  <span>Fuel-weight braking consistency</span>
                  <input
                    type="checkbox"
                    checked={raceConsistencyFocus}
                    onChange={(e) => setRaceConsistencyFocus(e.target.checked)}
                    className="w-4 h-4 accent-[#007AFF]"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Driving Profile Strip & Generate Preview CTA */}
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A192F]">
                <Gauge className="w-4 h-4 text-[#007AFF]" />
                <span>Style Weights</span>
              </div>
              <button
                type="button"
                onClick={() => onEditProfile(gameVersion)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Adjust</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-[#F2F2F7] py-2">
                <div className="text-[10px] text-[#64748B]">Grip</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeProfile.speedVsGrip}/10
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2">
                <div className="text-[10px] text-[#64748B]">Stability</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeProfile.rearStability}/10
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2">
                <div className="text-[10px] text-[#64748B]">Tyre Life</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {activeProfile.tyreWearPriority}/10
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="ios-press w-full flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3.5 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,122,255,0.3)] hover:bg-[#0066D6] min-h-[48px] cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>Generate Setup Preview</span>
            </button>
          </section>
        </motion.form>
      ) : (
        <motion.form
          key="step-review"
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 14 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          onSubmit={handleSaveSetup}
          className="space-y-3.5"
        >
          {/* Step 2 Header */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('configure');
                scrollMainToTop();
              }}
              className="ios-press inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#007AFF] shadow-sm min-h-[36px] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Track</span>
            </button>

            {editedCount > 0 && (
              <button
                type="button"
                onClick={handleResetToAiDraft}
                className="ios-press inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] px-3 py-1.5 text-[11px] font-semibold text-[#0B4F9E] min-h-[36px] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset ({editedCount})</span>
              </button>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          {/* Setup Name & Folder Picker */}
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#007AFF]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Step 2 · Review, Tweak &amp; Save</span>
                </div>
                <h1 className="mt-0.5 text-lg font-bold text-[#0A192F]">
                  {activeCircuit.name} · {GAME_VERSIONS[gameVersion].shortLabel}
                </h1>
              </div>
              {draftBaseline && (
                <div className="rounded-2xl bg-[#EBF3FF] px-3 py-1.5 text-center shrink-0">
                  <div className="text-[9.5px] font-semibold text-[#0B4F9E]">Fit</div>
                  <div className="font-mono-tabular text-sm font-bold text-[#0A2558]">
                    {draftBaseline.analysis.compatibilityScore}%
                  </div>
                </div>
              )}
            </div>

            {draftBaseline && (
              <p className="text-[11px] text-[#526581] leading-relaxed">
                {draftBaseline.analysis.suitabilitySummary}
              </p>
            )}

            <div>
              <label htmlFor="draft-setup-name" className="block text-[11px] font-semibold text-[#334155] mb-1">
                Setup Name
              </label>
              <input
                id="draft-setup-name"
                type="text"
                required
                value={setupTitle}
                onChange={(e) => setSetupTitle(e.target.value)}
                placeholder="Name this setup..."
                className="w-full rounded-2xl bg-[#F2F2F7] border border-black/[0.06] px-3.5 py-2.5 text-[13px] font-semibold text-[#0A192F] min-h-[44px]"
              />
            </div>

            {/* Folder Selector + Inline Folder Creator */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label htmlFor="draft-folder-select" className="text-[11px] font-semibold text-[#334155]">
                  Save into Folder
                </label>
                <button
                  type="button"
                  onClick={() => setCreatingNewFolder((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#007AFF] cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{creatingNewFolder ? 'Use Existing' : '+ New Folder'}</span>
                </button>
              </div>

              {creatingNewFolder ? (
                <input
                  id="draft-new-folder"
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. League Races, Spa Wet, Quali..."
                  className="w-full rounded-2xl bg-[#EBF3FF] border border-[#007AFF]/40 px-3.5 py-2.5 text-[13px] font-semibold text-[#0A192F] min-h-[44px]"
                />
              ) : (
                <select
                  id="draft-folder-select"
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="w-full rounded-2xl bg-[#F2F2F7] border border-black/[0.06] px-3.5 py-2.5 text-[13px] font-semibold text-[#0A192F] min-h-[44px]"
                >
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="ios-press w-full flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3.5 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,122,255,0.3)] hover:bg-[#0066D6] disabled:opacity-60 min-h-[48px] cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving Setup...' : 'Save Setup'}</span>
            </button>
          </section>

          {/* All 21 Editable Parameters */}
          {editedParams &&
            draftBaseline &&
            SECTIONS.map((section) => {
              const keys = PARAMETER_ORDER.filter((k) => specs[k].section === section);
              return (
                <section key={section} className="ios-card rounded-[24px] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold tracking-wide text-[#007AFF]">{section}</h2>
                    <span className="text-[10.5px] text-[#64748B]">Tap − / + to adjust</span>
                  </div>

                  <div className="divide-y divide-black/[0.06]">
                    {keys.map((key) => {
                      const spec = specs[key];
                      const currentVal = editedParams[key];
                      const baselineVal = draftBaseline.parameters[key];
                      const isModified = currentVal !== baselineVal;
                      const atMin = currentVal <= spec.min;
                      const atMax = currentVal >= spec.max;

                      return (
                        <div
                          key={key}
                          className="py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#0A192F] leading-snug">
                              {spec.label}
                            </div>
                            {isModified && (
                              <div className="text-[10px] font-semibold text-[#007AFF]">
                                AI: {formatParamValue(baselineVal, spec)} → Edited
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={atMin}
                              onClick={() => stepParameter(key, -1)}
                              aria-label={`Decrease ${spec.label}`}
                              className="ios-press w-8 h-8 rounded-full bg-[#F2F2F7] text-[#0A192F] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span
                              className={`font-mono-tabular text-xs font-bold w-16 text-center ${
                                isModified ? 'text-[#007AFF]' : 'text-[#0A192F]'
                              }`}
                            >
                              {formatParamValue(currentVal, spec)}
                            </span>

                            <button
                              type="button"
                              disabled={atMax}
                              onClick={() => stepParameter(key, 1)}
                              aria-label={`Increase ${spec.label}`}
                              className="ios-press w-8 h-8 rounded-full bg-[#F2F2F7] text-[#0A192F] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

          {/* Bottom Save CTA for effortless reach after reviewing all parameters */}
          <button
            type="submit"
            disabled={saving}
            className="ios-press w-full flex items-center justify-center gap-2 rounded-2xl bg-[#0A2558] py-3.5 px-5 text-sm font-bold text-white shadow-sm min-h-[48px] cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Setup...' : 'Save Setup'}</span>
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
};
