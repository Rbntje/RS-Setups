import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bot,
  Check,
  Copy,
  Folder,
  GitCompare,
  History,
  MessageSquarePlus,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import type {
  DrivingProfile,
  FeedbackTag,
  SavedSetup,
  SetupFolder,
  SetupParameterKey,
  SetupParameters,
  SetupVersionRecord,
} from '../types/setup';
import {
  AI_QUICK_PROMPTS,
  diagnoseAndTuneWithCodedAi,
  type CodedAiDiagnosis,
  type LocalAiBrain,
} from '../engine/setupAi';
import {
  FEEDBACK_OPTIONS,
  GAME_VERSIONS,
  PARAMETER_ORDER,
  clampAndStep,
  formatParamValue,
} from '../engine/specs';
import { formatSetupClipboard } from '../engine/generator';

interface SetupDetailsPageProps {
  setup: SavedSetup & { versions: SetupVersionRecord[] };
  folders: SetupFolder[];
  profile: DrivingProfile;
  aiBrain: LocalAiBrain;
  initialTab?: 'setup' | 'ai' | 'feedback' | 'history';
  onToggleFavourite: (setupId: string) => Promise<void>;
  onUpdateSetup: (
    setupId: string,
    patch: { title?: string; folderId?: string; parameters?: SetupParameters }
  ) => Promise<void>;
  onSubmitFeedback: (setupId: string, tags: FeedbackTag[], notes: string) => Promise<void>;
  onApplyAiTune: (setupId: string, prompt: string) => Promise<void>;
  onRestoreVersion: (setupId: string, versionNumber: number) => Promise<void>;
}

const SECTIONS = [
  'Aerodynamics',
  'Transmission',
  'Suspension Geometry',
  'Suspension',
  'Brakes',
  'Tyres',
] as const;

export const SetupDetailsPage: React.FC<SetupDetailsPageProps> = ({
  setup,
  folders,
  profile,
  aiBrain,
  initialTab = 'setup',
  onToggleFavourite,
  onUpdateSetup,
  onSubmitFeedback,
  onApplyAiTune,
  onRestoreVersion,
}) => {
  const [activeTab, setActiveTab] = useState<'setup' | 'ai' | 'feedback' | 'history'>(initialTab);
  const [copied, setCopied] = useState(false);

  // Rename / Folder quick panel
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaTitle, setMetaTitle] = useState(setup.title);
  const [metaFolderId, setMetaFolderId] = useState(setup.folderId);

  // Manual Parameter Edit mode inside Setup tab
  const [editingParams, setEditingParams] = useState(false);
  const [paramDraft, setParamDraft] = useState<SetupParameters>(setup.parameters);
  const [savingParams, setSavingParams] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDiagnosis, setAiDiagnosis] = useState<CodedAiDiagnosis | null>(null);
  const [applyingAi, setApplyingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [selectedTags, setSelectedTags] = useState<FeedbackTag[]>([]);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [submittingFb, setSubmittingFb] = useState(false);
  const [fbResultMsg, setFbResultMsg] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  const versions = setup.versions ?? [];
  const [compareLeftVer, setCompareLeftVer] = useState<number>(
    versions[1]?.versionNumber ?? versions[0]?.versionNumber ?? setup.currentVersion
  );
  const [compareRightVer, setCompareRightVer] = useState<number>(setup.currentVersion);
  const [restoringVer, setRestoringVer] = useState<number | null>(null);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, setup.id]);

  React.useEffect(() => {
    setMetaTitle(setup.title);
    setMetaFolderId(setup.folderId);
    setParamDraft(setup.parameters);
    setEditingParams(false);
    setCompareRightVer(setup.currentVersion);
    setCompareLeftVer(
      versions[1]?.versionNumber ?? versions[0]?.versionNumber ?? setup.currentVersion
    );
  }, [setup.id, setup.currentVersion, setup.title, setup.folderId, setup.parameters, versions.length]);

  const specs = GAME_VERSIONS[setup.gameVersion].parameters;
  const folderName = folders.find((f) => f.id === setup.folderId)?.name ?? '2025';

  const leftVersionObj = useMemo(
    () => versions.find((v) => v.versionNumber === compareLeftVer) ?? versions[0],
    [versions, compareLeftVer]
  );
  const rightVersionObj = useMemo(
    () => versions.find((v) => v.versionNumber === compareRightVer) ?? versions[0],
    [versions, compareRightVer]
  );

  const handleCopy = async () => {
    const text = formatSetupClipboard({
      title: setup.title,
      gameVersion: setup.gameVersion,
      circuitName: setup.circuitName,
      weather: setup.weather,
      sessionType: setup.sessionType,
      compatibilityScore: setup.analysis.compatibilityScore,
      parameters: setup.parameters,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSetup(setup.id, {
      title: metaTitle.trim() || setup.title,
      folderId: metaFolderId,
    });
    setEditingMeta(false);
    setFbResultMsg('Setup name & folder updated.');
  };

  const stepDraftParam = (key: SetupParameterKey, dir: -1 | 1) => {
    const spec = specs[key];
    setParamDraft((prev) => ({
      ...prev,
      [key]: clampAndStep(prev[key] + dir * spec.step, spec),
    }));
  };

  const paramChangedCount = PARAMETER_ORDER.filter(
    (k) => paramDraft[k] !== setup.parameters[k]
  ).length;

  const handleSaveManualParams = async () => {
    if (paramChangedCount === 0) {
      setEditingParams(false);
      return;
    }
    setSavingParams(true);
    try {
      await onUpdateSetup(setup.id, { parameters: paramDraft });
      setEditingParams(false);
      setFbResultMsg(`Saved v${setup.currentVersion + 1} with ${paramChangedCount} adjustment(s).`);
      scrollMainToTop();
    } finally {
      setSavingParams(false);
    }
  };

  const toggleTag = (tag: FeedbackTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const scrollMainToTop = () => {
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTags.length === 0) {
      setFbError('Select at least one track feedback item.');
      return;
    }
    setFbError(null);
    setSubmittingFb(true);
    try {
      await onSubmitFeedback(setup.id, selectedTags, feedbackNotes);
      setSelectedTags([]);
      setFeedbackNotes('');
      setFbResultMsg('New setup version generated and saved to history.');
      setActiveTab('history');
      scrollMainToTop();
    } catch (err) {
      setFbError(err instanceof Error ? err.message : 'Failed to apply feedback.');
    } finally {
      setSubmittingFb(false);
    }
  };

  const handleRestore = async (ver: number) => {
    setRestoringVer(ver);
    try {
      await onRestoreVersion(setup.id, ver);
      setActiveTab('setup');
      scrollMainToTop();
    } finally {
      setRestoringVer(null);
    }
  };

  const runCodedAiDiagnosis = (promptText: string) => {
    setAiError(null);
    setFbResultMsg(null);
    const trimmed = promptText.trim();
    if (!trimmed) {
      setAiError('Describe what the car is doing (or tap a quick symptom chip).');
      return;
    }
    const result = diagnoseAndTuneWithCodedAi({
      prompt: trimmed,
      gameVersion: setup.gameVersion,
      circuitId: setup.circuitId,
      weather: setup.weather,
      sessionType: setup.sessionType,
      currentParameters: setup.parameters,
      profile,
      aiBrain,
    });
    setAiDiagnosis(result);
  };

  const handleApplyAiDiagnosis = async () => {
    if (!aiPrompt.trim() || !aiDiagnosis || aiDiagnosis.recommendedDiffs.length === 0) return;
    setApplyingAi(true);
    setAiError(null);
    try {
      await onApplyAiTune(setup.id, aiPrompt);
      setAiDiagnosis(null);
      setAiPrompt('');
      setFbResultMsg(`RS Coded AI saved v${setup.currentVersion + 1} to local memory.`);
      setActiveTab('setup');
      scrollMainToTop();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to apply AI tune.');
    } finally {
      setApplyingAi(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Compact iPhone Hero Card */}
      <section className="ios-card rounded-[26px] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#526581]">
              <span className="inline-flex items-center gap-1 rounded-md bg-[#EBF3FF] px-1.5 py-0.5 text-[10px] font-bold text-[#007AFF]">
                <Folder className="w-3 h-3" />
                <span>{folderName}</span>
              </span>
              <span>
                {GAME_VERSIONS[setup.gameVersion].shortLabel} · {setup.weather.toUpperCase()} · v
                {setup.currentVersion}
              </span>
            </div>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[#0A192F] leading-snug">
              {setup.title}
            </h1>
          </div>

          <div className="rounded-2xl bg-[#EBF3FF] px-3 py-1.5 text-center shrink-0">
            <div className="text-[10px] font-semibold text-[#007AFF]">Fit</div>
            <div className="font-mono-tabular text-base font-bold text-[#0A2558]">
              {setup.analysis.compatibilityScore}%
            </div>
          </div>
        </div>

        <p className="text-xs text-[#475569] leading-relaxed">{setup.analysis.suitabilitySummary}</p>

        {/* Inline Rename / Move Folder Panel */}
        {editingMeta && (
          <form onSubmit={handleSaveMeta} className="pt-2 border-t border-black/[0.06] space-y-2">
            <input
              type="text"
              aria-label="Setup title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className="w-full rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs font-semibold text-[#0A192F] min-h-[40px]"
            />
            <div className="flex gap-2">
              <select
                aria-label="Move to folder"
                value={metaFolderId}
                onChange={(e) => setMetaFolderId(e.target.value)}
                className="flex-1 rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs font-semibold text-[#0A192F] min-h-[40px]"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    Folder: {f.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="ios-press rounded-2xl bg-[#007AFF] px-4 py-2 text-xs font-bold text-white min-h-[40px] cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <button
            type="button"
            onClick={handleCopy}
            className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#F2F2F7] px-2 py-2 text-[11px] font-semibold text-[#0A192F] min-h-[40px] cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleFavourite(setup.id)}
            className={`ios-press inline-flex items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold min-h-[40px] cursor-pointer whitespace-nowrap ${
              setup.isFavourite
                ? 'bg-[#EBF3FF] text-[#007AFF]'
                : 'bg-[#F2F2F7] text-[#334155]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 shrink-0 ${setup.isFavourite ? 'fill-[#007AFF]' : ''}`} />
            <span>{setup.isFavourite ? 'Saved' : 'Star'}</span>
          </button>

          <button
            type="button"
            onClick={() => setEditingMeta((v) => !v)}
            className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#F2F2F7] px-2 py-2 text-[11px] font-semibold text-[#0A192F] min-h-[40px] cursor-pointer whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
            <span>Move</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className="ios-press inline-flex items-center justify-center gap-1 rounded-2xl bg-[#007AFF] px-2 py-2 text-[11px] font-bold text-white min-h-[40px] cursor-pointer whitespace-nowrap"
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span>RS AI</span>
          </button>
        </div>
      </section>

      {/* Native iOS Animated Segmented Control */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-[#E5E7EB]/85 rounded-2xl">
        {(
          [
            { id: 'setup', label: 'Setup', icon: null },
            { id: 'ai', label: 'RS AI', icon: Sparkles },
            { id: 'feedback', label: 'Feedback', icon: null },
            { id: 'history', label: `v${versions.length}`, icon: GitCompare },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative z-0 inline-flex items-center justify-center gap-1 px-1.5 py-2 text-[11px] font-bold rounded-xl cursor-pointer min-h-[36px] whitespace-nowrap transition-colors ${
                active ? 'text-[#007AFF]' : 'text-[#526581]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="details-tab-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-xl bg-white shadow-sm -z-10"
                />
              )}
              {Icon && <Icon className="w-3 h-3 shrink-0" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {fbResultMsg && (
        <div className="rounded-2xl border border-[#C6DAF7] bg-[#EBF3FF] p-3 text-xs font-medium text-[#0A2558]">
          {fbResultMsg}
        </div>
      )}

      {/* TAB 1: SETUP VALUES (VIEW OR EDIT DIRECTLY) */}
      {activeTab === 'setup' && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-[#526581]">All 21 Parameters</span>
            <button
              type="button"
              onClick={() => {
                if (editingParams) {
                  setParamDraft(setup.parameters);
                  setEditingParams(false);
                } else {
                  setEditingParams(true);
                }
              }}
              className="ios-press inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#007AFF] shadow-sm cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{editingParams ? 'Cancel Edit' : 'Edit Numbers'}</span>
            </button>
          </div>

          {editingParams && paramChangedCount > 0 && (
            <button
              type="button"
              disabled={savingParams}
              onClick={handleSaveManualParams}
              className="ios-press w-full flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3 px-4 text-xs font-bold text-white shadow-sm min-h-[44px] cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {savingParams
                  ? 'Saving...'
                  : `Save ${paramChangedCount} Edit${paramChangedCount === 1 ? '' : 's'} as v${setup.currentVersion + 1}`}
              </span>
            </button>
          )}

          {SECTIONS.map((section) => {
            const keys = PARAMETER_ORDER.filter((k) => specs[k].section === section);
            return (
              <section key={section} className="ios-card rounded-[24px] p-4">
                <h2 className="text-xs font-bold tracking-wide text-[#007AFF]">{section}</h2>
                {editingParams ? (
                  <div className="mt-2 divide-y divide-black/[0.06]">
                    {keys.map((key) => {
                      const spec = specs[key];
                      const val = paramDraft[key];
                      return (
                        <div key={key} className="py-2.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#0A192F]">{spec.label}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={val <= spec.min}
                              onClick={() => stepDraftParam(key, -1)}
                              aria-label={`Decrease ${spec.label}`}
                              className="ios-press w-8 h-8 rounded-full bg-[#F2F2F7] text-[#0A192F] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono-tabular text-xs font-bold w-14 text-center">
                              {formatParamValue(val, spec)}
                            </span>
                            <button
                              type="button"
                              disabled={val >= spec.max}
                              onClick={() => stepDraftParam(key, 1)}
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
                ) : (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {keys.map((key) => {
                      const spec = specs[key];
                      const val = setup.parameters[key];
                      return (
                        <div
                          key={key}
                          className="rounded-2xl bg-[#F2F2F7]/85 p-2.5 flex flex-col justify-between"
                        >
                          <div className="text-[11px] font-medium text-[#526581] leading-tight">
                            {spec.label}
                          </div>
                          <div className="mt-1 font-mono-tabular text-base font-bold text-[#0A192F]">
                            {formatParamValue(val, spec)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <h2 className="text-sm font-bold text-[#0A192F]">Engineering Analysis</h2>
            <p className="text-xs text-[#526581] leading-relaxed">
              {setup.analysis.suitabilityDistinction}
            </p>
            <div className="divide-y divide-black/[0.06]">
              {setup.analysis.explanations.map((exp) => (
                <div key={exp.section} className="py-2.5">
                  <div className="text-xs font-bold text-[#007AFF]">{exp.section}</div>
                  <div className="font-mono-tabular text-[11px] font-semibold text-[#0A192F] mt-0.5">
                    {exp.parameterLabels}
                  </div>
                  <p className="mt-1 text-xs text-[#475569] leading-relaxed">{exp.reasoning}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: 100% SELF-CODED ON-DEVICE RS AI ENGINEER */}
      {activeTab === 'ai' && (
        <div className="space-y-3.5">
          <section className="ios-card rounded-[24px] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-bold text-[#0A192F]">
                  <Bot className="w-4 h-4 text-[#007AFF]" />
                  <h2>RS Setup AI Engineer</h2>
                </div>
                <p className="mt-0.5 text-[11px] text-[#526581] leading-relaxed">
                  100% custom-coded in TypeScript · Learns your style on this phone.
                </p>
              </div>
              <div className="rounded-2xl bg-[#EBF3FF] px-2.5 py-1 text-center shrink-0">
                <div className="text-[9px] font-semibold text-[#007AFF]">Learned</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A2558]">
                  {aiBrain.learnedInteractions}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-[#526581] mb-1.5">
                Quick Symptoms (1-Tap)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {AI_QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.id}
                    type="button"
                    onClick={() => {
                      setAiPrompt(qp.prompt);
                      runCodedAiDiagnosis(qp.prompt);
                    }}
                    className="ios-press rounded-2xl bg-[#F2F2F7] px-2.5 py-2 text-left text-[11px] font-semibold text-[#0A192F] hover:bg-[#EBF3FF] min-h-[38px] cursor-pointer"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runCodedAiDiagnosis(aiPrompt);
              }}
              className="space-y-2 pt-1"
            >
              <label htmlFor="rs-ai-input" className="block text-[11px] font-semibold text-[#334155]">
                Describe handling issue (English or Dutch)
              </label>
              <textarea
                id="rs-ai-input"
                rows={2}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Rear snaps exiting Turn 11, or: onderstuur bij insturen en stuitert over kerbs..."
                className="w-full rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F]"
              />
              {aiError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                  {aiError}
                </div>
              )}
              <button
                type="submit"
                className="ios-press w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3 px-4 text-xs font-bold text-white min-h-[44px] cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Analyze with RS Coded AI</span>
              </button>
            </form>
          </section>

          {aiDiagnosis && (
            <section className="ios-card rounded-[24px] p-4 space-y-3 border border-[#C6DAF7]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#007AFF]">
                  {aiDiagnosis.intentSummary}
                </div>
                <span className="font-mono-tabular text-[11px] font-bold text-[#0A2558]">
                  {aiDiagnosis.confidence}% match
                </span>
              </div>

              <p className="text-xs text-[#1E293B] leading-relaxed">
                {aiDiagnosis.engineerReply}
              </p>

              {aiDiagnosis.projectedImpacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aiDiagnosis.projectedImpacts.map((imp) => (
                    <span
                      key={imp}
                      className="rounded-full bg-[#EBF3FF] px-2.5 py-1 text-[10.5px] font-semibold text-[#007AFF]"
                    >
                      {imp}
                    </span>
                  ))}
                </div>
              )}

              {aiDiagnosis.recommendedDiffs.length > 0 ? (
                <>
                  <div className="divide-y divide-black/[0.06] pt-1">
                    {aiDiagnosis.recommendedDiffs.map((d) => (
                      <div key={d.key} className="py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#0A192F]">{d.label}</span>
                          <span className="font-mono-tabular font-bold text-[#007AFF]">
                            {d.formattedPrevious} → {d.formattedNext}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#526581]">{d.reason}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={applyingAi}
                    onClick={handleApplyAiDiagnosis}
                    className="ios-press w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0A2558] py-3 px-4 text-xs font-bold text-white disabled:opacity-60 min-h-[44px] cursor-pointer"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    <span>
                      {applyingAi
                        ? 'Saving...'
                        : `Apply AI Tune (Create v${setup.currentVersion + 1})`}
                    </span>
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-[#64748B]">
                  No parameter changes needed for this inquiry.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {/* TAB 3: SESSION FEEDBACK */}
      {activeTab === 'feedback' && (
        <form onSubmit={handleFeedbackSubmit} className="ios-card rounded-[24px] p-4 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#0A192F]">Session Feedback</h2>
            <p className="mt-1 text-xs text-[#526581] leading-relaxed">
              Tap how the car felt. Keeps v{setup.currentVersion} and creates v
              {setup.currentVersion + 1}.
            </p>
          </div>

          {fbError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {fbError}
            </div>
          )}

          <div className="space-y-2">
            {FEEDBACK_OPTIONS.map((opt) => {
              const active = selectedTags.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleTag(opt.id)}
                  aria-pressed={active}
                  className={`ios-press w-full rounded-2xl p-3 text-left border cursor-pointer min-h-[52px] ${
                    active
                      ? 'border-[#007AFF] bg-[#EBF3FF]'
                      : 'border-black/[0.06] bg-[#F2F2F7]/75'
                  }`}
                >
                  <div className="text-xs font-bold text-[#0A192F]">{opt.label}</div>
                  <div className="text-[11px] text-[#526581] mt-0.5">{opt.description}</div>
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="fb-notes" className="block text-xs font-semibold text-[#334155] mb-1">
              Corner Notes (optional)
            </label>
            <textarea
              id="fb-notes"
              rows={2}
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              placeholder="e.g. Slight snap exiting Turn 4..."
              className="w-full rounded-2xl bg-[#F2F2F7] px-3 py-2 text-xs text-[#0A192F]"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              className="ios-press rounded-2xl bg-[#F2F2F7] px-4 py-2.5 text-xs font-semibold text-[#334155] min-h-[44px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingFb}
              className="ios-press flex-1 rounded-2xl bg-[#007AFF] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60 min-h-[44px] cursor-pointer"
            >
              {submittingFb ? 'Applying...' : `Generate v${setup.currentVersion + 1}`}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: HISTORY & COMPARE */}
      {activeTab === 'history' && (
        <div className="space-y-3.5">
          <section className="ios-card rounded-[24px] p-4">
            <div className="flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#007AFF]" />
              <h2 className="text-sm font-bold text-[#0A192F]">Version Timeline</h2>
            </div>

            <div className="mt-3 divide-y divide-black/[0.06]">
              {versions.map((ver) => (
                <div key={ver.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                      Version {ver.versionNumber}{' '}
                      {ver.versionNumber === setup.currentVersion ? '(Current)' : ''}
                    </span>
                    {ver.versionNumber !== setup.currentVersion && (
                      <button
                        type="button"
                        disabled={restoringVer === ver.versionNumber}
                        onClick={() => handleRestore(ver.versionNumber)}
                        className="ios-press inline-flex items-center gap-1 rounded-full bg-[#EBF3FF] px-3 py-1 text-[11px] font-bold text-[#007AFF] cursor-pointer min-h-[32px]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{restoringVer === ver.versionNumber ? 'Restoring...' : 'Restore'}</span>
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#64748B]">
                    {new Date(ver.createdAt).toLocaleString()}
                  </div>
                  {ver.feedbackNotes && (
                    <p className="mt-1 text-xs text-[#334155]">{ver.feedbackNotes}</p>
                  )}
                  {ver.diffSummary && ver.diffSummary.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-[#007AFF]">
                      {ver.diffSummary.map((d) => (
                        <li key={d.key} className="font-mono-tabular">
                          {d.label}: {d.previous}
                          {d.unit} → {d.next}
                          {d.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="ios-card rounded-[24px] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0A192F]">Compare Versions</h2>
              <div className="flex items-center gap-1.5 text-xs">
                <select
                  aria-label="Compare left version"
                  value={compareLeftVer}
                  onChange={(e) => setCompareLeftVer(Number(e.target.value))}
                  className="rounded-xl bg-[#F2F2F7] px-2 py-1 font-mono-tabular font-semibold text-xs"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>
                      v{v.versionNumber}
                    </option>
                  ))}
                </select>
                <span className="text-[#64748B] text-xs">vs</span>
                <select
                  aria-label="Compare right version"
                  value={compareRightVer}
                  onChange={(e) => setCompareRightVer(Number(e.target.value))}
                  className="rounded-xl bg-[#F2F2F7] px-2 py-1 font-mono-tabular font-semibold text-xs"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>
                      v{v.versionNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {leftVersionObj && rightVersionObj && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-black/[0.06] text-[#526581]">
                      <th className="py-1.5 text-left font-semibold">Parameter</th>
                      <th className="py-1.5 text-right font-mono-tabular font-semibold">
                        v{leftVersionObj.versionNumber}
                      </th>
                      <th className="py-1.5 text-right font-mono-tabular font-semibold">
                        v{rightVersionObj.versionNumber}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {PARAMETER_ORDER.map((key: SetupParameterKey) => {
                      const spec = specs[key];
                      const a = leftVersionObj.parameters[key];
                      const b = rightVersionObj.parameters[key];
                      const changed = a !== b;
                      return (
                        <tr key={key} className={changed ? 'bg-[#EBF3FF]/70' : ''}>
                          <td className="py-1.5 text-[#1E293B] font-medium pr-2">{spec.label}</td>
                          <td className="py-1.5 text-right font-mono-tabular text-[#475569] whitespace-nowrap">
                            {formatParamValue(a, spec)}
                          </td>
                          <td
                            className={`py-1.5 text-right font-mono-tabular whitespace-nowrap ${
                              changed ? 'font-bold text-[#007AFF]' : 'text-[#475569]'
                            }`}
                          >
                            {formatParamValue(b, spec)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
