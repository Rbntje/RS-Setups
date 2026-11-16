import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Download,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { GameVersion } from '../types/setup';
import type { LocalAppSettings } from '../storage/localStore';
import type { LocalAiBrain } from '../engine/setupAi';
import { countLearnedCircuits } from '../engine/realtimeLearner';
import {
  formatStorageBytes,
  type OptimizationReport,
  type StorageBreakdown,
} from '../storage/storageOptimizer';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { IpaDownloadCard } from '../components/IpaDownloadCard';

interface SettingsPageProps {
  settings: LocalAppSettings;
  storageStats: StorageBreakdown;
  aiBrain: LocalAiBrain;
  learnerStatus: 'idle' | 'learning' | 'paused' | 'offline';
  liveAiActivity: string;
  stats: {
    setupsCount: number;
    versionsCount: number;
    foldersCount: number;
    referencesCount: number;
    aiLearnedCount: number;
  };
  onOpenLibrary: () => void;
  onSaveSettings: (patch: Partial<LocalAppSettings>) => Promise<void>;
  onTriggerLearnNow: () => Promise<boolean>;
  onRunAiOptimize: () => Promise<OptimizationReport>;
  onExportBackup: () => Promise<string>;
  onImportBackup: (rawJson: string) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  storageStats,
  aiBrain,
  learnerStatus,
  liveAiActivity,
  stats,
  onOpenLibrary,
  onSaveSettings,
  onTriggerLearnNow,
  onRunAiOptimize,
  onExportBackup,
  onImportBackup,
  onResetWorkspace,
}) => {
  const [preferredGameVersion, setPreferredGameVersion] = useState<GameVersion>(
    settings.preferredGameVersion
  );
  const [reducedMotionOverride, setReducedMotionOverride] = useState<
    LocalAppSettings['reducedMotionOverride']
  >(settings.reducedMotionOverride);
  const [learningManual, setLearningManual] = useState(false);

  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setPreferredGameVersion(settings.preferredGameVersion);
    setReducedMotionOverride(settings.reducedMotionOverride);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await onSaveSettings({
        preferredGameVersion,
        reducedMotionOverride,
      });
      setMsg('Preferences saved on this iPhone.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setMsg(null);
    setErr(null);
    try {
      const report = await onRunAiOptimize();
      const actionSummary = report.actionsPerformed[0] ?? 'AI memory cleaned.';
      setMsg(
        `AI Organizer done · Freed ${formatStorageBytes(report.bytesFreed)} · ${actionSummary}`
      );
    } catch {
      setErr('Could not optimize storage.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleExport = async () => {
    setErr(null);
    try {
      const json = await onExportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rs-setups-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('Backup file downloaded.');
    } catch {
      setErr('Could not export backup.');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setMsg(null);
    try {
      const text = await file.text();
      await onImportBackup(text);
      setMsg('Backup imported and organized within 200 MB limit.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Invalid backup file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4500);
      return;
    }
    await onResetWorkspace();
    setConfirmReset(false);
    setMsg('Garage wiped clean (0 setups, 2025 & 2026 folders ready).');
  };

  return (
    <div className="space-y-3.5">
      {msg && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#C6DAF7] bg-[#EBF3FF] p-3 text-xs font-medium text-[#0A2558]">
          <CheckCircle2 className="w-4 h-4 text-[#007AFF] shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {err}
        </div>
      )}

      {/* REAL-TIME ONLINE & ON-DEVICE AI LEARNING MONITOR */}
      <section className="ios-card rounded-[24px] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-[#EBF3FF] flex items-center justify-center text-[#007AFF]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0A192F]">RS AI · Live Learning</h2>
              <div className="text-[11px] text-[#526581]">
                Learns from web locally on phone
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              learnerStatus === 'learning'
                ? 'bg-[#EBF3FF] text-[#007AFF]'
                : learnerStatus === 'offline'
                  ? 'bg-amber-50 text-amber-700'
                  : learnerStatus === 'paused'
                    ? 'bg-[#F2F2F7] text-[#64748B]'
                    : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                learnerStatus === 'learning'
                  ? 'bg-[#007AFF] animate-ping'
                  : learnerStatus === 'offline'
                    ? 'bg-amber-500'
                    : learnerStatus === 'paused'
                      ? 'bg-[#94A3B8]'
                      : 'bg-emerald-500 animate-pulse'
              }`}
            />
            {learnerStatus === 'learning'
              ? 'Fetching Web'
              : learnerStatus === 'offline'
                ? 'Offline'
                : learnerStatus === 'paused'
                  ? 'Paused'
                  : 'Live'}
          </span>
        </div>

        {/* Auto-Learn Online Toggle */}
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-[#F2F2F7] px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#0A192F]">
              Realtime Internet Learning
            </div>
            <div className="text-[10.5px] text-[#526581]">
              Automatically reads online setups &amp; saves locally
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.autoLearnOnline}
            onChange={(e) => void onSaveSettings({ autoLearnOnline: e.target.checked })}
            aria-label="Toggle realtime internet learning"
            className="w-4 h-4 accent-[#007AFF] shrink-0"
          />
        </label>

        {/* Learned Knowledge Stats */}
        {(() => {
          const { uniqueCircuits } = countLearnedCircuits(aiBrain);
          const feedbackCount = (aiBrain.userFeedbackHistory ?? []).length;
          return (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Circuits</div>
                <div className="font-mono-tabular text-xs font-bold text-[#007AFF]">
                  {uniqueCircuits} / 24
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Your Feedback</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {feedbackCount} rule{feedbackCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
                <div className="text-[10px] text-[#64748B]">Updates</div>
                <div className="font-mono-tabular text-xs font-bold text-[#0A192F]">
                  {stats.aiLearnedCount}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Current Live Activity & Real Web Learning Feed */}
        <div className="rounded-2xl bg-[#F2F2F7] p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-[#007AFF] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[10.5px] font-bold text-[#64748B]">
                Live Activity Right Now
              </div>
              <div className="text-xs font-semibold text-[#0A192F] leading-snug mt-0.5">
                {liveAiActivity}
              </div>
            </div>
          </div>

          {(aiBrain.learningFeed ?? []).length > 0 && (
            <div className="pt-2 border-t border-black/[0.06] space-y-2 max-h-48 overflow-y-auto pr-0.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                Recent Websites &amp; Local Learning Log
              </div>
              {(aiBrain.learningFeed ?? []).slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-white px-2.5 py-2 border border-black/[0.05] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="font-bold text-[#0A192F] truncate">
                      {item.circuitName} ·{' '}
                      {item.kind === 'web_learn'
                        ? 'Web Learned'
                        : item.kind === 'user_feedback'
                          ? 'Your Feedback'
                          : 'AI Tune'}
                    </span>
                    <span className="font-mono-tabular text-[#64748B] shrink-0">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#334155] leading-snug">{item.summary}</div>
                  {item.domains && item.domains.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {item.domains.map((dom) => (
                        <span
                          key={dom}
                          className="inline-flex items-center gap-1 rounded-md bg-[#EBF3FF] px-1.5 py-0.5 text-[9.5px] font-bold text-[#007AFF]"
                        >
                          <Globe className="w-2.5 h-2.5" />
                          <span>{dom}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locally Stored Learned Circuits */}
        {Object.values(aiBrain.onlineCircuitKnowledge ?? {}).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-[#526581]">
              Stored Locally on Phone ({Object.values(aiBrain.onlineCircuitKnowledge ?? {}).length})
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {Object.values(aiBrain.onlineCircuitKnowledge ?? {})
                .slice(0, 12)
                .map((entry) => (
                  <span
                    key={entry.key}
                    className="rounded-full bg-[#EBF3FF] px-2.5 py-1 text-[10px] font-semibold text-[#0B4F9E]"
                  >
                    {entry.circuitName} ({entry.gameVersion === 'f1_25_2026_pack' ? '26' : '25'}{' '}
                    {entry.weather === 'wet' ? 'W' : 'D'}) · {entry.matchedParameterCount}p
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={learningManual || learnerStatus === 'learning'}
            onClick={async () => {
              setLearningManual(true);
              setMsg(null);
              try {
                const ok = await onTriggerLearnNow();
                setMsg(
                  ok
                    ? 'AI fetched live web setup data and saved it locally.'
                    : 'Offline or website unreachable right now — using local memory.'
                );
              } finally {
                setLearningManual(false);
              }
            }}
            className="ios-press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#007AFF] py-2.5 px-3 text-xs font-bold text-white disabled:opacity-60 min-h-[42px] cursor-pointer"
          >
            {learningManual || learnerStatus === 'learning' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Learn Web Now</span>
          </button>

          <button
            type="button"
            disabled={optimizing}
            onClick={handleOptimize}
            className="ios-press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#EBF3FF] py-2.5 px-3 text-xs font-bold text-[#007AFF] hover:bg-[#DCEBFF] min-h-[42px] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{optimizing ? 'Cleaning...' : 'Optimize AI'}</span>
          </button>
        </div>
      </section>

      {/* 200 MB STORAGE BUDGET MONITOR */}
      <section className="ios-card rounded-[24px] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <HardDrive className="w-4 h-4 text-[#007AFF] shrink-0" />
            <h2 className="text-sm font-bold text-[#0A192F] truncate">Phone Storage (200 MB)</h2>
          </div>
          <span className="font-mono-tabular text-xs font-bold text-[#007AFF] whitespace-nowrap shrink-0">
            {formatStorageBytes(storageStats.totalBytes)} / 200 MB
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              storageStats.overSoftThreshold
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-[#0B4F9E] to-[#007AFF]'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(2, Math.min(100, storageStats.percentUsed))}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
            <div className="text-[10px] text-[#64748B]">Setups ({stats.setupsCount})</div>
            <div className="font-mono-tabular text-[11px] font-bold text-[#0A192F]">
              {formatStorageBytes(storageStats.setupsBytes)}
            </div>
          </div>
          <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
            <div className="text-[10px] text-[#64748B]">AI Weights</div>
            <div className="font-mono-tabular text-[11px] font-bold text-[#007AFF]">
              {formatStorageBytes(storageStats.aiBrainBytes)}
            </div>
          </div>
          <div className="rounded-2xl bg-[#F2F2F7] py-2 px-1">
            <div className="text-[10px] text-[#64748B]">Folders ({stats.foldersCount})</div>
            <div className="font-mono-tabular text-[11px] font-bold text-[#0A192F]">
              {formatStorageBytes(storageStats.historyAndRefsBytes)}
            </div>
          </div>
        </div>
      </section>

      {/* Setup Library Access Row */}
      <button
        type="button"
        onClick={onOpenLibrary}
        className="ios-card ios-press w-full rounded-[24px] p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-2xl bg-[#EBF3FF] flex items-center justify-center text-[#007AFF] shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#0A192F]">Setup Library</div>
            <div className="text-[11px] text-[#526581]">
              {stats.referencesCount} pasted community reference{stats.referencesCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
      </button>

      {/* Install Phone App & Direct .IPA Download */}
      <section className="ios-card rounded-[24px] p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-[#007AFF]" />
          <h2 className="text-sm font-bold text-[#0A192F]">iPhone App &amp; .IPA Download</h2>
        </div>
        <PWAInstallButton variant="full" />
        <IpaDownloadCard
          variant="full"
          savedRepo={settings.githubRepo}
          onSaveRepo={async (repo) => {
            await onSaveSettings({ githubRepo: repo });
          }}
        />
      </section>

      {/* Simple App Preferences */}
      <form onSubmit={handleSave} className="ios-card rounded-[24px] p-4 space-y-3">
        <h2 className="text-sm font-bold text-[#0A192F]">Preferences</h2>

        <div>
          <label htmlFor="set-version" className="block text-[11px] font-semibold text-[#334155] mb-1">
            Default Car Spec
          </label>
          <select
            id="set-version"
            value={preferredGameVersion}
            onChange={(e) => setPreferredGameVersion(e.target.value as GameVersion)}
            className="w-full rounded-2xl bg-[#F2F2F7] px-3 py-2.5 text-xs font-semibold min-h-[42px]"
          >
            <option value="f1_25_2025">EA Sports F1 25 — 2025 Cars</option>
            <option value="f1_25_2026_pack">EA Sports F1 25 — 2026 Season Pack</option>
          </select>
        </div>

        <div>
          <label htmlFor="set-motion" className="block text-[11px] font-semibold text-[#334155] mb-1">
            Animations
          </label>
          <select
            id="set-motion"
            value={reducedMotionOverride}
            onChange={(e) =>
              setReducedMotionOverride(
                e.target.value as LocalAppSettings['reducedMotionOverride']
              )
            }
            className="w-full rounded-2xl bg-[#F2F2F7] px-3 py-2.5 text-xs font-semibold min-h-[42px]"
          >
            <option value="system">System Default</option>
            <option value="full">Full iOS Animations</option>
            <option value="reduced">Reduced Motion</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="ios-press w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#007AFF] py-3 px-4 text-xs font-bold text-white disabled:opacity-60 min-h-[44px] cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
        </button>
      </form>

      {/* Backup & Clean Reset */}
      <section className="ios-card rounded-[24px] p-4 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="ios-press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#F2F2F7] px-3 py-2.5 text-xs font-semibold text-[#007AFF] min-h-[42px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="ios-press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#F2F2F7] px-3 py-2.5 text-xs font-semibold text-[#0A192F] min-h-[42px] cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        <button
          type="button"
          onClick={handleReset}
          className={`ios-press w-full inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-semibold min-h-[42px] cursor-pointer ${
            confirmReset ? 'bg-red-600 text-white' : 'bg-[#FFF1F2] text-red-700'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{confirmReset ? 'Tap Again to Wipe All Data' : 'Start Fresh (Reset Garage)'}</span>
        </button>
      </section>
    </div>
  );
};
