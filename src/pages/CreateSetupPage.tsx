import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Bot,
  Check,
  CloudRain,
  ExternalLink,
  FolderPlus,
  Globe,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import {
  CheckCircle2,
  Circle,
  ThumbsUp,
  AlertTriangle,
} from 'lucide-react';
import type {
  DrivingProfile,
  GameVersion,
  ResearchResult,
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
  AI_QUICK_PROMPTS,
  type AiChatTurn,
  type AiFeedbackOutcome,
  type CodedAiDiagnosis,
  type LocalAiBrain,
} from '../engine/setupAi';
import { fetchLiveWebResearch, runOnlineAwareAiDiagnosis } from '../engine/liveWebClient';
import type { WebResearchPayload } from '../engine/webResearch';
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
  aiBrain: LocalAiBrain;
  references: ResearchResult[];
  circuitNotes: LocalCircuitNote[];
  onSaveCircuitNote: (circuitId: string, gameVersion: GameVersion, note: string) => Promise<void>;
  onRecordOnlineLearning: (payload: {
    webPayload: WebResearchPayload;
    weather: WeatherType;
  }) => Promise<void>;
  onRecordAiFeedbackOutcome: (payload: {
    gameVersion: GameVersion;
    circuitId: string;
    prompt: string;
    outcome: AiFeedbackOutcome;
  }) => Promise<void>;
  onGenerateDraft: (payload: {
    gameVersion: GameVersion;
    circuitId: string;
    weather: WeatherType;
    sessionType: SessionType;
    raceTyreFocus?: boolean;
    raceConsistencyFocus?: boolean;
    liveWebPayload?: WebResearchPayload | null;
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
}

const SECTIONS = [
  'Aerodynamics',
  'Transmission',
  'Suspension Geometry',
  'Suspension',
  'Brakes',
  'Tyres',
] as const;

const ENGINEERING_STAGES = [
  'Reading your driving style & local feedback memory...',
  'Scanning live F1 websites (f1laps.com & web search)...',
  'Checking 2025 / 2026 spec & kerb physics...',
  'Calibrating aero balance, diff lock & tyre temps...',
  'Finalizing personalized setup baseline...',
];

export const CreateSetupPage: React.FC<CreateSetupPageProps> = ({
  initialGameVersion,
  initialCircuitId,
  folders,
  profiles,
  aiBrain,
  references,
  circuitNotes,
  onSaveCircuitNote,
  onRecordOnlineLearning,
  onRecordAiFeedbackOutcome,
  onGenerateDraft,
  onSaveSetupDraft,
  onCreated,
}) => {
  const [step, setStep] = useState<'configure' | 'calculating' | 'review'>('configure');
  const [calcStage, setCalcStage] = useState(0);
  const [calcLiveWebDomains, setCalcLiveWebDomains] = useState<string[]>([]);

  const [gameVersion, setGameVersion] = useState<GameVersion>(initialGameVersion);
  const [circuitId, setCircuitId] = useState<string>(initialCircuitId || 'silverstone');
  const [weather, setWeather] = useState<WeatherType>('dry');
  const [sessionType, setSessionType] = useState<SessionType>('race');
  const [raceTyreFocus, setRaceTyreFocus] = useState(true);
  const [raceConsistencyFocus, setRaceConsistencyFocus] = useState(true);

  const [circuitNote, setCircuitNote] = useState('');
  const [noteSavedMsg, setNoteSavedMsg] = useState<string | null>(null);

  // Step 2: Generated Preview & Edit State
  const [draftBaseline, setDraftBaseline] = useState<DraftPreview | null>(null);
  const [draftWebSummary, setDraftWebSummary] = useState<{
    domains: string[];
    matchedCount: number;
    note: string | null;
  } | null>(null);
  const [editedParams, setEditedParams] = useState<SetupParameters | null>(null);
  const [setupTitle, setSetupTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    getDefaultFolderIdForVersion(initialGameVersion)
  );
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Preview AI Assistant state with full conversation thread & feedback loop
  const [previewAiPrompt, setPreviewAiPrompt] = useState('');
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState('');
  const [previewChatHistory, setPreviewChatHistory] = useState<AiChatTurn[]>([]);
  const [previewAiThinking, setPreviewAiThinking] = useState(false);
  const [previewAiStatusText, setPreviewAiStatusText] = useState<string>(
    'Connecting to F1 websites & setup search...'
  );
  const [previewAiDiagnosis, setPreviewAiDiagnosis] = useState<CodedAiDiagnosis | null>(null);
  const [previewAiAppliedMsg, setPreviewAiAppliedMsg] = useState<string | null>(null);
  const [previewFeedbackMsg, setPreviewFeedbackMsg] = useState<string | null>(null);

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
      setNoteSavedMsg('Note saved locally.');
    } catch (err) {
      setNoteSavedMsg(err instanceof Error ? err.message : 'Failed to save note.');
    }
  };

  const handleGeneratePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep('calculating');
    setCalcStage(0);
    setCalcLiveWebDomains([]);
    scrollMainToTop();

    const timer = setInterval(() => {
      setCalcStage((s) => (s < ENGINEERING_STAGES.length - 1 ? s + 1 : s));
    }, 680);

    try {
      // Run genuine live web research + deliberate minimum 3.1s engineering synthesis in parallel
      const [webPayload] = await Promise.all([
        fetchLiveWebResearch({
          prompt: `Best ${weather} ${sessionType} setup meta for ${activeCircuit.name}`,
          circuitId,
          gameVersion,
          weather,
          sessionType,
        }),
        new Promise((resolve) => setTimeout(resolve, 3150)),
      ]);

      if (webPayload?.ok) {
        const domains = Array.from(new Set(webPayload.webSources.map((s) => s.domain)));
        setCalcLiveWebDomains(domains);
        await onRecordOnlineLearning({ webPayload, weather });
        setDraftWebSummary({
          domains,
          matchedCount: webPayload.matchedParameterCount,
          note: webPayload.driverConsensusNote,
        });
      } else {
        setDraftWebSummary(null);
      }

      const preview = onGenerateDraft({
        gameVersion,
        circuitId,
        weather,
        sessionType,
        raceTyreFocus: sessionType === 'race' ? raceTyreFocus : false,
        raceConsistencyFocus: sessionType === 'race' ? raceConsistencyFocus : false,
        liveWebPayload: webPayload,
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
      setPreviewAiPrompt('');
      setLastSubmittedPrompt('');
      setPreviewChatHistory([]);
      setPreviewAiDiagnosis(null);
      setPreviewAiAppliedMsg(null);
      setPreviewFeedbackMsg(null);
      setStep('review');
      scrollMainToTop();
    } finally {
      clearInterval(timer);
    }
  };

  const handleAskPreviewAi = async (promptInput: string) => {
    if (!editedParams) return;
    const trimmed = promptInput.trim();
    if (!trimmed) return;

    const historySnapshot = [...previewChatHistory];
    setPreviewChatHistory((prev) => [...prev, { role: 'user' as const, text: trimmed }].slice(-8));
    setLastSubmittedPrompt(trimmed);
    setPreviewAiThinking(true);
    setPreviewAiStatusText('Visiting F1 setup websites & checking your local AI memory...');
    setPreviewAiAppliedMsg(null);
    setPreviewFeedbackMsg(null);

    try {
      const { diagnosis, webPayload } = await runOnlineAwareAiDiagnosis({
        prompt: trimmed,
        gameVersion,
        circuitId,
        weather,
        sessionType,
        currentParameters: editedParams,
        profile: activeProfile,
        aiBrain,
        references,
        conversationHistory: historySnapshot,
        onWebStage: (msg) => setPreviewAiStatusText(msg),
      });
      if (webPayload?.ok) {
        await onRecordOnlineLearning({ webPayload, weather });
      }
      setPreviewChatHistory((prev) =>
        [...prev, { role: 'ai' as const, text: diagnosis.engineerReply }].slice(-8)
      );
      setPreviewAiDiagnosis(diagnosis);
      setPreviewAiPrompt('');
    } finally {
      setPreviewAiThinking(false);
    }
  };

  const handlePreviewFeedback = async (outcome: AiFeedbackOutcome, followUpPrompt?: string) => {
    await onRecordAiFeedbackOutcome({
      gameVersion,
      circuitId,
      prompt: lastSubmittedPrompt || previewAiDiagnosis?.intentSummary || 'Preview check',
      outcome,
    });
    if (outcome === 'helpful') {
      setPreviewFeedbackMsg('Onthouden voor dit circuit & jouw rijstijl.');
      return;
    }
    if (followUpPrompt) {
      await handleAskPreviewAi(followUpPrompt);
    }
  };

  const handleApplyPreviewAi = () => {
    if (!previewAiDiagnosis || previewAiDiagnosis.recommendedDiffs.length === 0) return;
    setEditedParams({ ...previewAiDiagnosis.nextParameters });
    setPreviewAiAppliedMsg(
      `Applied ${previewAiDiagnosis.recommendedDiffs.length} AI tweak${previewAiDiagnosis.recommendedDiffs.length === 1 ? '' : 's'} to this preview.`
    );
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
    setPreviewAiAppliedMsg(null);
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
      {step === 'calculating' ? (
        <motion.div
          key="step-calculating"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="ios-card rounded-[28px] p-6 my-4 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#EBF3FF] text-[#007AFF] flex items-center justify-center shrink-0">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-[#0A192F] truncate">
                AI Engineering · {activeCircuit.name}
              </h1>
              <p className="text-[11px] font-semibold text-[#007AFF]">
                {ENGINEERING_STAGES[calcStage]}
              </p>
            </div>
          </div>

          <div className="h-1.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#007AFF]"
              initial={{ width: '12%' }}
              animate={{ width: `${((calcStage + 1) / ENGINEERING_STAGES.length) * 100}%` }}
              transition={{ duration: 0.45 }}
            />
          </div>

          <div className="rounded-2xl bg-[#F2F2F7] p-3 space-y-2">
            {ENGINEERING_STAGES.map((label, idx) => {
              const done = idx < calcStage;
              const active = idx === calcStage;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-2 text-[11px] ${
                    done
                      ? 'text-emerald-700 font-semibold'
                      : active
                        ? 'text-[#007AFF] font-bold'
                        : 'text-[#8E8E93]'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? 'text-[#007AFF] animate-pulse' : 'text-[#CBD5E1]'
                      }`}
                    />
                  )}
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>

          {calcLiveWebDomains.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold text-[#0B4F9E]">
              <Globe className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>Synced online: {calcLiveWebDomains.join(', ')}</span>
            </div>
          )}

          <p className="text-[11px] text-[#64748B] text-center">
            {GAME_VERSIONS[gameVersion].shortLabel} · {weather.toUpperCase()} ·{' '}
            {sessionType.replace('_', ' ').toUpperCase()}
          </p>
        </motion.div>
      ) : step === 'configure' ? (
        <motion.form
          key="step-configure"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          onSubmit={handleGeneratePreview}
          className="space-y-3.5"
        >
          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {error}
            </div>
          )}

          {/* User-friendly Step Indicator */}
          <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-[#526581]">
            <span className="inline-flex items-center gap-1.5 text-[#007AFF]">
              <span className="w-2 h-2 rounded-full bg-[#007AFF]" />
              Step 1 · Pick Track &amp; Car
            </span>
            <span>Next: Preview &amp; Save</span>
          </div>

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
                    className={`ios-press rounded-2xl p-3 text-left border transition-all min-h-[58px] cursor-pointer ${
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
                className="flex-1 min-w-0 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F] min-h-[40px]"
              />
              <button
                type="button"
                onClick={handleSaveNote}
                className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#EBF3FF] px-3.5 py-2 text-xs font-semibold text-[#007AFF] min-h-[40px] cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Note</span>
              </button>
            </div>
            {noteSavedMsg && <p className="text-[11px] font-medium text-[#007AFF]">{noteSavedMsg}</p>}
          </section>

          {/* 3. Conditions & Session */}
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
                <label className="flex items-center justify-between gap-2 text-xs text-[#0A192F] cursor-pointer min-h-[34px]">
                  <span>Long-stint tyre protection</span>
                  <input
                    type="checkbox"
                    checked={raceTyreFocus}
                    onChange={(e) => setRaceTyreFocus(e.target.checked)}
                    className="w-4 h-4 accent-[#007AFF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-[#0A192F] cursor-pointer min-h-[34px]">
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

          <motion.button
            type="submit"
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3.5 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,122,255,0.3)] hover:bg-[#0066D6] min-h-[48px] cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>Generate Setup Preview</span>
          </motion.button>
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

          {/* Setup Name, Folder & Save Card */}
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-[#007AFF]">
                  Preview · Review, Ask AI &amp; Save
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
                  placeholder="e.g. League Races, Spa Wet..."
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

          {/* Live Online & Local Research Summary Pill on Preview */}
          {draftWebSummary && (
            <section className="rounded-2xl bg-[#EBF3FF] border border-[#C6DAF7] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-[#0A2558]">
              <Globe className="w-4 h-4 text-[#007AFF] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold">
                  Online learned ({draftWebSummary.domains.slice(0, 2).join(', ')}) ·{' '}
                  {draftWebSummary.matchedCount} params synced
                </div>
                {draftWebSummary.note && (
                  <div className="text-[11px] text-[#334155] mt-0.5">{draftWebSummary.note}</div>
                )}
              </div>
            </section>
          )}

          {/* Conversational Ask RS AI + Feedback Loop inside Preview BEFORE Saving */}
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A192F]">
                <Bot className="w-4 h-4 text-[#007AFF]" />
                <span>Ask RS AI Before Saving</span>
              </div>
              <span className="text-[10px] font-semibold text-[#007AFF]">Listens &amp; Learns</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AI_QUICK_PROMPTS.slice(0, 4).map((qp) => (
                <button
                  key={qp.id}
                  type="button"
                  disabled={previewAiThinking}
                  onClick={() => {
                    void handleAskPreviewAi(qp.prompt);
                  }}
                  className="ios-press rounded-full bg-[#F2F2F7] hover:bg-[#EBF3FF] px-3 py-1.5 text-[11px] font-semibold text-[#0A192F] cursor-pointer"
                >
                  {qp.label}
                </button>
              ))}
            </div>

            {/* Conversation History Thread */}
            {previewChatHistory.length > 0 && (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {previewChatHistory.map((turn, idx) => (
                  <div
                    key={`${idx}-${turn.role}`}
                    className={`rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed ${
                      turn.role === 'user'
                        ? 'bg-[#007AFF] text-white ml-6'
                        : 'bg-[#F2F2F7] text-[#0A192F] mr-4'
                    }`}
                  >
                    {turn.text}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Ask RS AI about this preview"
                value={previewAiPrompt}
                onChange={(e) => setPreviewAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAskPreviewAi(previewAiPrompt);
                  }
                }}
                placeholder="Zeg wat de auto doet of geef feedback (NL/EN)..."
                className="flex-1 min-w-0 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F] min-h-[40px]"
              />
              <button
                type="button"
                disabled={previewAiThinking || !previewAiPrompt.trim()}
                onClick={() => void handleAskPreviewAi(previewAiPrompt)}
                className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#007AFF] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50 min-h-[40px] cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ask AI</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {previewAiThinking && (
                <motion.div
                  key="preview-ai-thinking"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="rounded-2xl bg-[#EBF3FF] p-3 flex items-center gap-2.5 text-xs font-semibold text-[#007AFF]"
                >
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{previewAiStatusText}</span>
                </motion.div>
              )}

              {!previewAiThinking && previewAiAppliedMsg && (
                <motion.div
                  key="preview-ai-applied"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800"
                >
                  {previewAiAppliedMsg}
                </motion.div>
              )}

              {!previewAiThinking && previewAiDiagnosis && (
                <motion.div
                  key="preview-ai-diagnosis"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="rounded-2xl bg-[#F2F2F7] p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#007AFF]">
                    <span>{previewAiDiagnosis.intentSummary}</span>
                    <span className="font-mono-tabular">{previewAiDiagnosis.confidence}%</span>
                  </div>
                  {previewAiDiagnosis.searchedSources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {previewAiDiagnosis.searchedSources.map((src) => (
                        <span
                          key={src}
                          className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#334155] border border-black/[0.05]"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-[#1E293B] leading-relaxed">
                    {previewAiDiagnosis.engineerReply}
                  </p>
                  {previewAiDiagnosis.followUpQuestion && (
                    <p className="text-[11px] font-medium text-[#0B4F9E]">
                      {previewAiDiagnosis.followUpQuestion}
                    </p>
                  )}

                  {/* Direct Driver Feedback Buttons */}
                  <div className="pt-1 border-t border-black/[0.06] space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                      Give Feedback to AI
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handlePreviewFeedback('helpful')}
                        className="ios-press inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700 cursor-pointer"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>Werkt goed</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handlePreviewFeedback(
                            'still_oversteer',
                            'Ik heb nog steeds overstuur, maak achterkant nog stabieler'
                          )
                        }
                        className="ios-press inline-flex items-center gap-1 rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-[10.5px] font-semibold text-[#0A192F] cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>Nog overstuur</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handlePreviewFeedback(
                            'still_understeer',
                            'Hij heeft nog steeds onderstuur, geef meer voorgrip'
                          )
                        }
                        className="ios-press rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-[10.5px] font-semibold text-[#0A192F] cursor-pointer"
                      >
                        <span>Nog onderstuur</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handlePreviewFeedback(
                            'too_slow',
                            'Te traag op het rechte stuk, geef meer topsnelheid'
                          )
                        }
                        className="ios-press rounded-full bg-white border border-black/[0.08] px-2.5 py-1 text-[10.5px] font-semibold text-[#0A192F] cursor-pointer"
                      >
                        <span>Te traag</span>
                      </button>
                    </div>
                    {previewFeedbackMsg && (
                      <div className="text-[11px] font-semibold text-emerald-700">
                        {previewFeedbackMsg}
                      </div>
                    )}
                  </div>

                  {previewAiDiagnosis.webSources && previewAiDiagnosis.webSources.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-1 text-[10.5px] font-bold text-[#0B4F9E]">
                        <Globe className="w-3 h-3" />
                        <span>Websites Checked Live</span>
                      </div>
                      {previewAiDiagnosis.webSources.slice(0, 3).map((ws) => (
                        <a
                          key={ws.url}
                          href={ws.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl bg-white/95 border border-black/[0.06] px-2.5 py-2 hover:border-[#007AFF]/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-[#0A192F] truncate">
                              {ws.title}
                            </span>
                            <ExternalLink className="w-3 h-3 text-[#007AFF] shrink-0" />
                          </div>
                          <div className="text-[10px] font-semibold text-[#007AFF]">{ws.domain}</div>
                          {ws.snippet && (
                            <p className="text-[10.5px] text-[#526581] line-clamp-2 mt-0.5">
                              {ws.snippet}
                            </p>
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {previewAiDiagnosis.recommendedDiffs.length > 0 && (
                    <>
                      <div className="divide-y divide-black/[0.06] text-[11px]">
                        {previewAiDiagnosis.recommendedDiffs.map((d) => (
                          <div key={d.key} className="py-1.5 flex items-center justify-between gap-2">
                            <span className="font-medium text-[#0A192F]">{d.label}</span>
                            <span className="font-mono-tabular font-bold text-[#007AFF]">
                              {d.formattedPrevious} → {d.formattedNext}
                            </span>
                          </div>
                        ))}
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleApplyPreviewAi}
                        className="w-full rounded-2xl bg-[#0A2558] py-2.5 px-3 text-xs font-bold text-white cursor-pointer"
                      >
                        Apply AI Changes to Preview
                      </motion.button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
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
                    <span className="text-[10.5px] text-[#64748B]">− / + adjust</span>
                  </div>

                  <div className="divide-y divide-black/[0.06]">
                    {keys.map((key) => {
                      const spec = specs[key];
                      const currentVal = editedParams[key];
                      const baselineVal = draftBaseline.parameters[key];
                      const isModified = currentVal !== baselineVal;

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
                                Draft: {formatParamValue(baselineVal, spec)} → Edited
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.88 }}
                              disabled={currentVal <= spec.min}
                              onClick={() => stepParameter(key, -1)}
                              aria-label={`Decrease ${spec.label}`}
                              className="w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E7EB] text-[#0A192F] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </motion.button>

                            <motion.span
                              key={`${key}-${currentVal}`}
                              initial={{ scale: 1.14, color: '#007AFF' }}
                              animate={{ scale: 1, color: isModified ? '#007AFF' : '#0A192F' }}
                              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                              className="font-mono-tabular text-xs font-bold w-16 text-center"
                            >
                              {formatParamValue(currentVal, spec)}
                            </motion.span>

                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.88 }}
                              disabled={currentVal >= spec.max}
                              onClick={() => stepParameter(key, 1)}
                              aria-label={`Increase ${spec.label}`}
                              className="w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E7EB] text-[#0A192F] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </motion.button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </motion.form>
      )}
    </AnimatePresence>
  );
};
