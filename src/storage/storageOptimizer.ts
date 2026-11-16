import type { LocalAiBrain } from '../engine/setupAi';
import type { SetupParameterKey } from '../types/setup';
import type { LocalWorkspaceState } from './localStore';

export const MAX_STORAGE_BUDGET_BYTES = 200 * 1024 * 1024; // 200 MB hard limit
export const SOFT_COMPACTION_BYTES = 160 * 1024 * 1024; // 160 MB proactive cleanup threshold

export interface StorageBreakdown {
  totalBytes: number;
  budgetBytes: number;
  percentUsed: number;
  setupsBytes: number;
  aiBrainBytes: number;
  historyAndRefsBytes: number;
  overSoftThreshold: boolean;
  overBudget: boolean;
}

export interface OptimizationReport {
  nextState: LocalWorkspaceState;
  bytesBefore: number;
  bytesAfter: number;
  bytesFreed: number;
  actionsPerformed: string[];
}

function measureJsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(json).length;
  }
  return json.length * 2;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function calculateWorkspaceStorageStats(
  state: LocalWorkspaceState
): StorageBreakdown {
  const setupsBytes = measureJsonBytes(state.setups);
  const aiBrainBytes = measureJsonBytes(state.aiBrain);
  const historyAndRefsBytes = measureJsonBytes({
    feedbackLog: state.feedbackLog,
    circuitNotes: state.circuitNotes,
    references: state.references,
    folders: state.folders,
  });
  const totalBytes = measureJsonBytes(state);

  return {
    totalBytes,
    budgetBytes: MAX_STORAGE_BUDGET_BYTES,
    percentUsed: Math.min(100, Number(((totalBytes / MAX_STORAGE_BUDGET_BYTES) * 100).toFixed(4))),
    setupsBytes,
    aiBrainBytes,
    historyAndRefsBytes,
    overSoftThreshold: totalBytes >= SOFT_COMPACTION_BYTES,
    overBudget: totalBytes > MAX_STORAGE_BUDGET_BYTES,
  };
}

function compactAiBrain(brain: LocalAiBrain): { next: LocalAiBrain; prunedWeights: number } {
  let prunedWeights = 0;
  const cleanGlobal: Partial<Record<SetupParameterKey, number>> = {};

  for (const [k, v] of Object.entries(brain.globalStyleShifts) as Array<[SetupParameterKey, number]>) {
    if (typeof v === 'number' && Math.abs(v) >= 0.01) {
      cleanGlobal[k] = Number(v.toFixed(3));
    } else {
      prunedWeights += 1;
    }
  }

  const cleanTracks: Record<string, Partial<Record<SetupParameterKey, number>>> = {};
  for (const [trackKey, map] of Object.entries(brain.trackBiases)) {
    const cleanMap: Partial<Record<SetupParameterKey, number>> = {};
    for (const [k, v] of Object.entries(map) as Array<[SetupParameterKey, number]>) {
      if (typeof v === 'number' && Math.abs(v) >= 0.01) {
        cleanMap[k] = Number(v.toFixed(3));
      } else {
        prunedWeights += 1;
      }
    }
    if (Object.keys(cleanMap).length > 0) {
      cleanTracks[trackKey] = cleanMap;
    }
  }

  // Deduplicate insights while keeping latest first
  const seen = new Set<string>();
  const uniqueInsights: string[] = [];
  for (const item of brain.recentInsights) {
    const key = item.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      uniqueInsights.push(item.trim());
    }
    if (uniqueInsights.length >= 10) break;
  }

  // Keep up to 48 newest online circuit knowledge snapshots so storage stays tiny
  const rawOnline = brain.onlineCircuitKnowledge ?? {};
  const keptOnlineEntries = Object.values(rawOnline)
    .sort((a, b) => b.learnedAt.localeCompare(a.learnedAt))
    .slice(0, 48);
  const cleanOnline: typeof rawOnline = {};
  for (const entry of keptOnlineEntries) {
    cleanOnline[entry.key] = entry;
  }

  return {
    next: {
      ...brain,
      globalStyleShifts: cleanGlobal,
      trackBiases: cleanTracks,
      recentInsights: uniqueInsights,
      onlineCircuitKnowledge: cleanOnline,
      learningFeed: (brain.learningFeed ?? []).slice(0, 20),
      userFeedbackHistory: (brain.userFeedbackHistory ?? []).slice(0, 20),
      updatedAt: new Date().toISOString(),
    },
    prunedWeights,
  };
}

/**
 * Organizes and trims redundant AI knowledge, duplicate logs, and stale intermediate history
 * so local phone storage always stays compact and strictly below the 200 MB cap.
 */
export function optimizeWorkspaceStorage(
  state: LocalWorkspaceState,
  options?: { targetBudgetBytes?: number; keepVersionsPerSetup?: number }
): OptimizationReport {
  const targetBudget = options?.targetBudgetBytes ?? MAX_STORAGE_BUDGET_BYTES;
  const keepVersions = options?.keepVersionsPerSetup ?? 6;
  const bytesBefore = measureJsonBytes(state);
  const actionsPerformed: string[] = [];

  // 1. Compact AI Brain weights & insights
  const { next: nextAiBrain, prunedWeights } = compactAiBrain(state.aiBrain);
  if (prunedWeights > 0 || nextAiBrain.recentInsights.length < state.aiBrain.recentInsights.length) {
    actionsPerformed.push(
      `Compacted AI weights (${prunedWeights} negligible weight${prunedWeights === 1 ? '' : 's'} cleared)`
    );
  }

  // 2. Deduplicate feedbackLog entries already absorbed into AI Brain
  const seenFeedback = new Set<string>();
  const dedupedFeedback = state.feedbackLog.filter((fb) => {
    const sig = `${fb.gameVersion}:${fb.circuitId}:${fb.setupId}:${[...fb.tags].sort().join(',')}:${fb.notes}`;
    if (seenFeedback.has(sig)) return false;
    seenFeedback.add(sig);
    return true;
  }).slice(0, 40);

  if (dedupedFeedback.length < state.feedbackLog.length) {
    actionsPerformed.push(
      `Merged ${state.feedbackLog.length - dedupedFeedback.length} duplicate feedback log entries`
    );
  }

  // 3. Deduplicate references
  const seenRefs = new Set<string>();
  const dedupedRefs = state.references.filter((r) => {
    const sig = `${r.gameVersion}:${r.circuitId}:${r.weather}:${r.title.toLowerCase()}`;
    if (seenRefs.has(sig)) return false;
    seenRefs.add(sig);
    return true;
  });
  if (dedupedRefs.length < state.references.length) {
    actionsPerformed.push(
      `Removed ${state.references.length - dedupedRefs.length} duplicate setup references`
    );
  }

  // 4. Trim excessive intermediate versions per setup (always keep latest & v1 baseline)
  let trimmedVersions = 0;
  let nextSetups = state.setups.map((setup) => {
    const versions = setup.versions ?? [];
    if (versions.length <= keepVersions) return setup;
    const latest = versions.slice(0, keepVersions - 1);
    const baseline = versions[versions.length - 1];
    const kept = latest.some((v) => v.versionNumber === baseline.versionNumber)
      ? latest
      : [...latest, baseline];
    trimmedVersions += versions.length - kept.length;
    return {
      ...setup,
      versions: kept,
    };
  });

  if (trimmedVersions > 0) {
    actionsPerformed.push(`Archived ${trimmedVersions} intermediate setup snapshots`);
  }

  let nextState: LocalWorkspaceState = {
    ...state,
    aiBrain: nextAiBrain,
    feedbackLog: dedupedFeedback,
    references: dedupedRefs,
    setups: nextSetups,
    lastOptimizedAt: new Date().toISOString(),
  };

  // 5. Hard 200 MB cap enforcement: progressively drop oldest non-favourite snapshots/setups if ever exceeded
  let currentBytes = measureJsonBytes(nextState);
  if (currentBytes > targetBudget) {
    // First strip older non-latest versions even further (keep only latest 2 per setup)
    nextSetups = nextState.setups.map((s) => ({
      ...s,
      versions: (s.versions ?? []).slice(0, 2),
    }));
    nextState = { ...nextState, setups: nextSetups };
    actionsPerformed.push('Compressed older setup version history to stay under 200 MB cap');
    currentBytes = measureJsonBytes(nextState);
  }

  // If still above targetBudget, remove oldest non-favourite setups
  if (currentBytes > targetBudget) {
    const kept: typeof nextState.setups = [];
    const nonFav = nextState.setups.filter((s) => !s.isFavourite);
    const favs = nextState.setups.filter((s) => s.isFavourite);
    kept.push(...favs);
    for (const s of nonFav) {
      const candidate = { ...nextState, setups: [...kept, s] };
      if (measureJsonBytes(candidate) <= targetBudget) {
        kept.push(s);
      }
    }
    nextState = {
      ...nextState,
      setups: kept,
      feedbackLog: nextState.feedbackLog.slice(0, 15),
    };
    actionsPerformed.push('Evicted oldest unstarred setups to enforce 200 MB limit');
  }

  const bytesAfter = measureJsonBytes(nextState);
  const bytesFreed = Math.max(0, bytesBefore - bytesAfter);
  if (actionsPerformed.length === 0) {
    actionsPerformed.push('Storage & AI weights verified clean (under 200 MB cap)');
  }

  return {
    nextState,
    bytesBefore,
    bytesAfter,
    bytesFreed,
    actionsPerformed,
  };
}
