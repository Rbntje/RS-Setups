import type {
  DrivingProfile,
  FeedbackTag,
  GameVersion,
  ResearchResult,
  SavedSetup,
  SessionType,
  SetupAnalysis,
  SetupFolder,
  SetupParameters,
  SetupVersionRecord,
  WeatherType,
} from '../types/setup';
import { applyFeedbackToSetup, generateSetup, getCircuitById } from '../engine/generator';
import { parseSetupTextToParameters } from '../engine/parser';
import { GAME_VERSIONS, PARAMETER_ORDER, clampAndStep } from '../engine/specs';
import { createDefaultProfile } from '../engine/wizard';
import {
  createInitialAiBrain,
  diagnoseAndTuneWithCodedAi,
  recordOnlineLearningIntoBrain,
  trainAiBrainFromDeltas,
  trainAiBrainFromFeedbackOutcome,
  trainAiBrainFromRestore,
  type AiFeedbackOutcome,
  type CodedAiDiagnosis,
  type LocalAiBrain,
} from '../engine/setupAi';
import type { WebResearchPayload } from '../engine/webResearch';
import {
  SOFT_COMPACTION_BYTES,
  calculateWorkspaceStorageStats,
  optimizeWorkspaceStorage,
  type OptimizationReport,
} from './storageOptimizer';

export const DEFAULT_FOLDER_2025_ID = 'folder_2025';
export const DEFAULT_FOLDER_2026_ID = 'folder_2026';

export interface LocalCircuitNote {
  id: string;
  gameVersion: GameVersion;
  circuitId: string;
  note: string;
  updatedAt: string;
}

export interface LocalFeedbackEntry {
  id: string;
  setupId: string;
  setupTitle: string;
  circuitId: string;
  circuitName: string;
  gameVersion: GameVersion;
  fromVersion: number;
  toVersion: number;
  tags: FeedbackTag[];
  notes: string;
  createdAt: string;
}

export interface LocalAppSettings {
  preferredGameVersion: GameVersion;
  lastCircuitId: string;
  reducedMotionOverride: 'system' | 'reduced' | 'full';
  githubRepo: string;
  autoLearnOnline: boolean;
}

export interface LocalWorkspaceState {
  schemaVersion: 3;
  settings: LocalAppSettings;
  folders: SetupFolder[];
  profiles: Record<GameVersion, DrivingProfile>;
  setups: Array<SavedSetup & { versions: SetupVersionRecord[] }>;
  feedbackLog: LocalFeedbackEntry[];
  circuitNotes: LocalCircuitNote[];
  references: ResearchResult[];
  aiBrain: LocalAiBrain;
  lastOptimizedAt: string;
  updatedAt: string;
}

export interface PersistenceAdapter {
  load(): Promise<LocalWorkspaceState | null>;
  save(state: LocalWorkspaceState): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'rs_setups_local_v3';
const STORE_NAME = 'workspace';
const STATE_KEY = 'primary';

export function makeLocalId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function getDefaultFolderIdForVersion(gameVersion: GameVersion): string {
  return gameVersion === 'f1_25_2026_pack' ? DEFAULT_FOLDER_2026_ID : DEFAULT_FOLDER_2025_ID;
}

export function createDefaultFolders(now = new Date().toISOString()): SetupFolder[] {
  return [
    {
      id: DEFAULT_FOLDER_2025_ID,
      name: '2025',
      systemDefault: true,
      createdAt: now,
    },
    {
      id: DEFAULT_FOLDER_2026_ID,
      name: '2026',
      systemDefault: true,
      createdAt: now,
    },
  ];
}

export function createIndexedDbAdapter(): PersistenceAdapter {
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
    });

  return {
    async load() {
      if (typeof indexedDB === 'undefined') return null;
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(STATE_KEY);
        req.onsuccess = () => {
          resolve((req.result as LocalWorkspaceState | undefined) ?? null);
        };
        req.onerror = () => reject(req.error || new Error('Failed to read IndexedDB'));
      });
    },
    async save(state) {
      if (typeof indexedDB === 'undefined') return;
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(state, STATE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error('Failed to write IndexedDB'));
      });
    },
    async clear() {
      if (typeof indexedDB === 'undefined') return;
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(STATE_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error('Failed to clear IndexedDB'));
      });
    },
  };
}

export function createMemoryAdapter(): PersistenceAdapter {
  let snapshot: LocalWorkspaceState | null = null;
  return {
    async load() {
      return snapshot ? structuredClone(snapshot) : null;
    },
    async save(state) {
      snapshot = structuredClone(state);
    },
    async clear() {
      snapshot = null;
    },
  };
}

/**
 * Fresh from-scratch starting state:
 * - 0 pre-made setups
 * - 0 accounts / driver names / team names
 * - 2 automatic folders: "2025" and "2026"
 */
export function createInitialWorkspaceState(): LocalWorkspaceState {
  const now = new Date().toISOString();

  const profile25: DrivingProfile = {
    ...createDefaultProfile('f1_25_2025'),
    id: 'prof_local_2025',
    userId: 'local',
    wizardCompleted: false,
    updatedAt: now,
  };

  const profile26: DrivingProfile = {
    ...createDefaultProfile('f1_25_2026_pack'),
    id: 'prof_local_2026',
    userId: 'local',
    wizardCompleted: false,
    updatedAt: now,
  };

  return {
    schemaVersion: 3,
    settings: {
      preferredGameVersion: 'f1_25_2025',
      lastCircuitId: 'silverstone',
      reducedMotionOverride: 'system',
      githubRepo: '',
      autoLearnOnline: true,
    },
    folders: createDefaultFolders(now),
    profiles: {
      f1_25_2025: profile25,
      f1_25_2026_pack: profile26,
    },
    setups: [],
    feedbackLog: [],
    circuitNotes: [],
    references: [],
    aiBrain: createInitialAiBrain(),
    lastOptimizedAt: now,
    updatedAt: now,
  };
}

function ensureSystemFolders(folders: SetupFolder[] | undefined): SetupFolder[] {
  const list = Array.isArray(folders) ? [...folders] : [];
  const now = new Date().toISOString();
  if (!list.some((f) => f.id === DEFAULT_FOLDER_2025_ID)) {
    list.unshift({ id: DEFAULT_FOLDER_2025_ID, name: '2025', systemDefault: true, createdAt: now });
  }
  if (!list.some((f) => f.id === DEFAULT_FOLDER_2026_ID)) {
    list.splice(1, 0, { id: DEFAULT_FOLDER_2026_ID, name: '2026', systemDefault: true, createdAt: now });
  }
  return list;
}

export function createLocalStore(adapter: PersistenceAdapter = createIndexedDbAdapter()) {
  let cachedState: LocalWorkspaceState | null = null;

  async function ensureState(): Promise<LocalWorkspaceState> {
    if (cachedState) return cachedState;
    const loaded = await adapter.load().catch(() => null);
    if (loaded && loaded.schemaVersion === 3) {
      cachedState = {
        ...loaded,
        folders: ensureSystemFolders(loaded.folders),
        settings: {
          ...loaded.settings,
          githubRepo: loaded.settings?.githubRepo ?? '',
          autoLearnOnline: loaded.settings?.autoLearnOnline ?? true,
        },
        aiBrain: {
          ...createInitialAiBrain(),
          ...(loaded.aiBrain ?? {}),
        },
        lastOptimizedAt: loaded.lastOptimizedAt ?? new Date().toISOString(),
      };
      return cachedState;
    }
    const fresh = createInitialWorkspaceState();
    await adapter.save(fresh).catch(() => {});
    cachedState = fresh;
    return cachedState;
  }

  async function commit(next: LocalWorkspaceState): Promise<LocalWorkspaceState> {
    let candidate: LocalWorkspaceState = {
      ...next,
      folders: ensureSystemFolders(next.folders),
      updatedAt: new Date().toISOString(),
    };

    // Enforce 200 MB storage cap automatically on every write
    const stats = calculateWorkspaceStorageStats(candidate);
    if (stats.overSoftThreshold || stats.overBudget) {
      candidate = optimizeWorkspaceStorage(candidate).nextState;
    }

    await adapter.save(candidate);
    cachedState = candidate;
    return candidate;
  }

  function buildDraftWithState(
    state: LocalWorkspaceState,
    payload: {
      gameVersion: GameVersion;
      circuitId: string;
      weather: WeatherType;
      sessionType: SessionType;
      raceTyreFocus?: boolean;
      raceConsistencyFocus?: boolean;
      liveWebPayload?: WebResearchPayload | null;
    }
  ) {
    const profile = state.profiles[payload.gameVersion];
    const rememberedTags: FeedbackTag[] = [];
    for (const fb of state.feedbackLog) {
      if (fb.circuitId === payload.circuitId && fb.gameVersion === payload.gameVersion) {
        for (const t of fb.tags) {
          if (!rememberedTags.includes(t)) rememberedTags.push(t);
        }
      }
    }

    const matchingNote = state.circuitNotes.find(
      (n) => n.circuitId === payload.circuitId && n.gameVersion === payload.gameVersion
    )?.note;

    return generateSetup({
      gameVersion: payload.gameVersion,
      circuitId: payload.circuitId,
      weather: payload.weather,
      sessionType: payload.sessionType,
      profile,
      raceTyreFocus: payload.raceTyreFocus,
      raceConsistencyFocus: payload.raceConsistencyFocus,
      researchEntries: state.references,
      recentCircuitFeedback: rememberedTags,
      circuitNote: matchingNote,
      aiBrain: state.aiBrain,
      liveWebPayload: payload.liveWebPayload,
    });
  }

  return {
    async loadWorkspace(): Promise<LocalWorkspaceState> {
      return structuredClone(await ensureState());
    },

    /**
     * Generates a setup preview WITHOUT saving it yet, so the user can review and optionally tweak
     * every parameter, choose a custom name, and select or create a folder before saving.
     */
    generateSetupDraft(payload: {
      gameVersion: GameVersion;
      circuitId: string;
      weather: WeatherType;
      sessionType: SessionType;
      raceTyreFocus?: boolean;
      raceConsistencyFocus?: boolean;
      liveWebPayload?: WebResearchPayload | null;
    }) {
      const state = cachedState ?? createInitialWorkspaceState();
      return buildDraftWithState(state, payload);
    },

    async saveSetupDraft(payload: {
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
    }): Promise<SavedSetup & { versions: SetupVersionRecord[] }> {
      const state = await ensureState();
      const circuit = getCircuitById(payload.circuitId);
      const specs = GAME_VERSIONS[payload.gameVersion].parameters;
      const now = new Date().toISOString();

      // Normalize all parameters safely in case the user edited them in the preview screen
      const normalized = {} as SetupParameters;
      for (const key of PARAMETER_ORDER) {
        normalized[key] = clampAndStep(payload.parameters[key], specs[key]);
      }

      // Optionally create a new folder on the spot
      let folders = [...state.folders];
      let targetFolderId = payload.folderId || getDefaultFolderIdForVersion(payload.gameVersion);
      const cleanNewFolder = payload.newFolderName?.trim();
      if (cleanNewFolder) {
        const existing = folders.find(
          (f) => f.name.toLowerCase() === cleanNewFolder.toLowerCase()
        );
        if (existing) {
          targetFolderId = existing.id;
        } else {
          const createdFolder: SetupFolder = {
            id: makeLocalId('fld'),
            name: cleanNewFolder.slice(0, 32),
            createdAt: now,
          };
          folders = [...folders, createdFolder];
          targetFolderId = createdFolder.id;
        }
      } else if (!folders.some((f) => f.id === targetFolderId)) {
        targetFolderId = getDefaultFolderIdForVersion(payload.gameVersion);
      }

      const setupId = makeLocalId('stp');
      const verId = makeLocalId('ver');
      const versionTag = payload.gameVersion === 'f1_25_2026_pack' ? '2026' : '2025';
      const defaultTitle = `${circuit.name} ${versionTag} ${payload.sessionType.replace('_', ' ')}`;
      const title = payload.title.trim() || defaultTitle;

      const newSetup: SavedSetup & { versions: SetupVersionRecord[] } = {
        id: setupId,
        userId: 'local',
        folderId: targetFolderId,
        title,
        gameVersion: payload.gameVersion,
        circuitId: circuit.id,
        circuitName: circuit.name,
        weather: payload.weather,
        sessionType: payload.sessionType,
        raceTyreFocus: Boolean(payload.raceTyreFocus),
        raceConsistencyFocus: Boolean(payload.raceConsistencyFocus),
        isFavourite: false,
        currentVersion: 1,
        parameters: normalized,
        analysis: payload.analysis,
        createdAt: now,
        updatedAt: now,
        versions: [
          {
            id: verId,
            setupId,
            versionNumber: 1,
            parameters: normalized,
            analysis: payload.analysis,
            feedbackApplied: [],
            feedbackNotes: 'Saved setup',
            diffSummary: [],
            createdAt: now,
          },
        ],
      };

      await commit({
        ...state,
        folders,
        settings: {
          ...state.settings,
          preferredGameVersion: payload.gameVersion,
          lastCircuitId: circuit.id,
        },
        setups: [newSetup, ...state.setups],
      });

      return structuredClone(newSetup);
    },

    async createFolder(name: string): Promise<SetupFolder> {
      const state = await ensureState();
      const clean = name.trim().slice(0, 32);
      if (!clean) throw new Error('Enter a folder name.');
      const duplicate = state.folders.find(
        (f) => f.name.toLowerCase() === clean.toLowerCase()
      );
      if (duplicate) return duplicate;

      const folder: SetupFolder = {
        id: makeLocalId('fld'),
        name: clean,
        createdAt: new Date().toISOString(),
      };

      await commit({
        ...state,
        folders: [...state.folders, folder],
      });
      return structuredClone(folder);
    },

    async renameFolder(folderId: string, name: string): Promise<SetupFolder> {
      const state = await ensureState();
      const clean = name.trim().slice(0, 32);
      if (!clean) throw new Error('Enter a folder name.');
      const target = state.folders.find((f) => f.id === folderId);
      if (!target) throw new Error('Folder not found.');
      if (target.systemDefault) throw new Error('Default 2025 and 2026 folders stay fixed.');

      const updated: SetupFolder = { ...target, name: clean };
      await commit({
        ...state,
        folders: state.folders.map((f) => (f.id === folderId ? updated : f)),
      });
      return structuredClone(updated);
    },

    async deleteFolder(folderId: string): Promise<void> {
      const state = await ensureState();
      const target = state.folders.find((f) => f.id === folderId);
      if (!target) return;
      if (target.systemDefault) throw new Error('Default 2025 and 2026 folders cannot be deleted.');

      const reassignedSetups = state.setups.map((s) =>
        s.folderId === folderId
          ? { ...s, folderId: getDefaultFolderIdForVersion(s.gameVersion) }
          : s
      );

      await commit({
        ...state,
        folders: state.folders.filter((f) => f.id !== folderId),
        setups: reassignedSetups,
      });
    },

    async updateSetup(
      setupId: string,
      patch: {
        title?: string;
        folderId?: string;
        parameters?: SetupParameters;
      }
    ): Promise<SavedSetup & { versions: SetupVersionRecord[] }> {
      const state = await ensureState();
      const target = state.setups.find((s) => s.id === setupId);
      if (!target) throw new Error('Setup not found.');

      const now = new Date().toISOString();
      const nextTitle = patch.title !== undefined ? patch.title.trim() || target.title : target.title;
      const nextFolderId =
        patch.folderId && state.folders.some((f) => f.id === patch.folderId)
          ? patch.folderId
          : target.folderId;

      let nextSetup: SavedSetup & { versions: SetupVersionRecord[] } = {
        ...target,
        title: nextTitle,
        folderId: nextFolderId,
        updatedAt: now,
      };

      if (patch.parameters) {
        const specs = GAME_VERSIONS[target.gameVersion].parameters;
        const normalized = {} as SetupParameters;
        const diffSummary: SetupVersionRecord['diffSummary'] = [];
        for (const key of PARAMETER_ORDER) {
          const val = clampAndStep(patch.parameters[key], specs[key]);
          normalized[key] = val;
          if (val !== target.parameters[key]) {
            diffSummary.push({
              key,
              label: specs[key].label,
              previous: target.parameters[key],
              next: val,
              unit: specs[key].unit,
              reason: 'Edited directly by driver',
            });
          }
        }
        if (diffSummary.length > 0) {
          const nextVersion = target.currentVersion + 1;
          const verRec: SetupVersionRecord = {
            id: makeLocalId('ver'),
            setupId,
            versionNumber: nextVersion,
            parameters: normalized,
            analysis: target.analysis,
            feedbackApplied: [],
            feedbackNotes: `Manual edit (${diffSummary.length} adjustment${diffSummary.length === 1 ? '' : 's'})`,
            diffSummary,
            createdAt: now,
          };
          nextSetup = {
            ...nextSetup,
            currentVersion: nextVersion,
            parameters: normalized,
            versions: [verRec, ...target.versions],
          };
        }
      }

      await commit({
        ...state,
        setups: state.setups.map((s) => (s.id === setupId ? nextSetup : s)),
      });

      return structuredClone(nextSetup);
    },

    async saveProfile(
      payload: Partial<DrivingProfile> & { gameVersion: GameVersion }
    ): Promise<DrivingProfile> {
      const state = await ensureState();
      const existing = state.profiles[payload.gameVersion];
      const clamp10 = (v: unknown, fallback: number) =>
        Math.max(1, Math.min(10, Math.round(Number(v ?? fallback))));
      const now = new Date().toISOString();

      const sharedStyle = {
        speedVsGrip: clamp10(payload.speedVsGrip, existing.speedVsGrip),
        rearStability: clamp10(payload.rearStability, existing.rearStability),
        carAggression: clamp10(payload.carAggression, existing.carAggression),
        understeerTendency: clamp10(payload.understeerTendency, existing.understeerTendency),
        understeerPhase: payload.understeerPhase ?? existing.understeerPhase,
        oversteerTendency: clamp10(payload.oversteerTendency, existing.oversteerTendency),
        oversteerPhase: payload.oversteerPhase ?? existing.oversteerPhase,
        tyreWearPriority: clamp10(payload.tyreWearPriority, existing.tyreWearPriority),
        paceVsConsistency: clamp10(payload.paceVsConsistency, existing.paceVsConsistency),
        limitConfidence: clamp10(payload.limitConfidence, existing.limitConfidence),
        wetConfidence: clamp10(payload.wetConfidence, existing.wetConfidence),
        wizardCompleted: payload.wizardCompleted ?? true,
        updatedAt: now,
      };

      const updated2025: DrivingProfile = {
        ...state.profiles.f1_25_2025,
        ...sharedStyle,
        gameVersion: 'f1_25_2025',
      };

      const updated2026: DrivingProfile = {
        ...state.profiles.f1_25_2026_pack,
        ...sharedStyle,
        gameVersion: 'f1_25_2026_pack',
      };

      await commit({
        ...state,
        profiles: {
          f1_25_2025: updated2025,
          f1_25_2026_pack: updated2026,
        },
      });
      return structuredClone(
        payload.gameVersion === 'f1_25_2026_pack' ? updated2026 : updated2025
      );
    },

    async saveCircuitNote(
      circuitId: string,
      gameVersion: GameVersion,
      note: string
    ): Promise<LocalCircuitNote> {
      const state = await ensureState();
      const now = new Date().toISOString();
      const cleanNote = note.trim().slice(0, 1500);
      const existing = state.circuitNotes.find(
        (n) => n.circuitId === circuitId && n.gameVersion === gameVersion
      );
      const entry: LocalCircuitNote = {
        id: existing?.id ?? makeLocalId('note'),
        gameVersion,
        circuitId,
        note: cleanNote,
        updatedAt: now,
      };
      const others = state.circuitNotes.filter(
        (n) => !(n.circuitId === circuitId && n.gameVersion === gameVersion)
      );
      await commit({
        ...state,
        circuitNotes: cleanNote ? [entry, ...others] : others,
      });
      return entry;
    },

    async toggleFavourite(setupId: string): Promise<boolean> {
      const state = await ensureState();
      let nextVal = false;
      const now = new Date().toISOString();
      const setups = state.setups.map((s) => {
        if (s.id !== setupId) return s;
        nextVal = !s.isFavourite;
        return { ...s, isFavourite: nextVal, updatedAt: now };
      });
      await commit({ ...state, setups });
      return nextVal;
    },

    async deleteSetup(setupId: string): Promise<void> {
      const state = await ensureState();
      await commit({
        ...state,
        setups: state.setups.filter((s) => s.id !== setupId),
        feedbackLog: state.feedbackLog.filter((f) => f.setupId !== setupId),
      });
    },

    async submitFeedback(
      setupId: string,
      payload: { tags: FeedbackTag[]; notes: string }
    ): Promise<{
      setup: SavedSetup & { versions: SetupVersionRecord[] };
      profile: DrivingProfile;
    }> {
      const state = await ensureState();
      const target = state.setups.find((s) => s.id === setupId);
      if (!target) throw new Error('Setup not found.');

      const profile = state.profiles[target.gameVersion];
      const matchingRefs = state.references.filter(
        (r) => r.gameVersion === target.gameVersion && r.weather === target.weather
      );

      const applied = applyFeedbackToSetup({
        gameVersion: target.gameVersion,
        circuitId: target.circuitId,
        weather: target.weather,
        sessionType: target.sessionType,
        currentParameters: target.parameters,
        profile,
        feedbackTags: payload.tags,
        feedbackNotes: payload.notes.trim(),
        researchEntries: matchingRefs,
      });

      const nextVersion = target.currentVersion + 1;
      const now = new Date().toISOString();
      const newVerRecord: SetupVersionRecord = {
        id: makeLocalId('ver'),
        setupId,
        versionNumber: nextVersion,
        parameters: applied.nextParameters,
        analysis: applied.nextAnalysis,
        feedbackApplied: payload.tags,
        feedbackNotes: payload.notes.trim() || applied.appliedSummary,
        diffSummary: applied.diffSummary,
        createdAt: now,
      };

      const updatedSetup: SavedSetup & { versions: SetupVersionRecord[] } = {
        ...target,
        currentVersion: nextVersion,
        parameters: applied.nextParameters,
        analysis: applied.nextAnalysis,
        updatedAt: now,
        versions: [newVerRecord, ...target.versions],
      };

      const feedbackEntry: LocalFeedbackEntry = {
        id: makeLocalId('fbk'),
        setupId,
        setupTitle: target.title,
        circuitId: target.circuitId,
        circuitName: target.circuitName,
        gameVersion: target.gameVersion,
        fromVersion: target.currentVersion,
        toVersion: nextVersion,
        tags: payload.tags,
        notes: payload.notes.trim(),
        createdAt: now,
      };

      const updatedProfile: DrivingProfile = {
        ...applied.nextProfile,
        updatedAt: now,
      };

      const nextAiBrain = trainAiBrainFromDeltas(state.aiBrain, {
        gameVersion: target.gameVersion,
        circuitId: target.circuitId,
        deltas: applied.diffSummary.map((d) => ({
          key: d.key,
          delta: d.next - d.previous,
        })),
        insightSummary: `${target.circuitName}: learned from ${payload.tags.map((t) => t.replace(/_/g, ' ')).join(', ')}`,
      });

      await commit({
        ...state,
        profiles: {
          ...state.profiles,
          [target.gameVersion]: updatedProfile,
        },
        setups: state.setups.map((s) => (s.id === setupId ? updatedSetup : s)),
        feedbackLog: [feedbackEntry, ...state.feedbackLog].slice(0, 40),
        aiBrain: nextAiBrain,
      });

      return {
        setup: structuredClone(updatedSetup),
        profile: structuredClone(updatedProfile),
      };
    },

    async applyAiTune(
      setupId: string,
      prompt: string,
      precomputedDiagnosis?: CodedAiDiagnosis
    ): Promise<{
      setup: SavedSetup & { versions: SetupVersionRecord[] };
      diagnosis: CodedAiDiagnosis;
    }> {
      const state = await ensureState();
      const target = state.setups.find((s) => s.id === setupId);
      if (!target) throw new Error('Setup not found.');

      const profile = state.profiles[target.gameVersion];
      const diagnosis =
        precomputedDiagnosis ??
        diagnoseAndTuneWithCodedAi({
          prompt,
          gameVersion: target.gameVersion,
          circuitId: target.circuitId,
          weather: target.weather,
          sessionType: target.sessionType,
          currentParameters: target.parameters,
          profile,
          aiBrain: state.aiBrain,
          references: state.references,
        });

      if (diagnosis.recommendedDiffs.length === 0) {
        return { setup: structuredClone(target), diagnosis };
      }

      const nextVersion = target.currentVersion + 1;
      const now = new Date().toISOString();
      const specs = GAME_VERSIONS[target.gameVersion].parameters;
      const diffSummary: SetupVersionRecord['diffSummary'] = diagnosis.recommendedDiffs.map((d) => ({
        key: d.key,
        label: d.label,
        previous: d.previous,
        next: d.next,
        unit: specs[d.key].unit,
        reason: d.reason,
      }));

      const newVerRecord: SetupVersionRecord = {
        id: makeLocalId('ver'),
        setupId,
        versionNumber: nextVersion,
        parameters: diagnosis.nextParameters,
        analysis: target.analysis,
        feedbackApplied: diagnosis.inferredTags,
        feedbackNotes: `RS Coded AI: "${prompt.trim().slice(0, 180)}" — ${diagnosis.engineerReply}`,
        diffSummary,
        createdAt: now,
      };

      const updatedSetup: SavedSetup & { versions: SetupVersionRecord[] } = {
        ...target,
        currentVersion: nextVersion,
        parameters: diagnosis.nextParameters,
        updatedAt: now,
        versions: [newVerRecord, ...target.versions],
      };

      const feedbackEntry: LocalFeedbackEntry = {
        id: makeLocalId('fbk'),
        setupId,
        setupTitle: target.title,
        circuitId: target.circuitId,
        circuitName: target.circuitName,
        gameVersion: target.gameVersion,
        fromVersion: target.currentVersion,
        toVersion: nextVersion,
        tags: diagnosis.inferredTags,
        notes: `RS AI: ${diagnosis.intentSummary}`,
        createdAt: now,
      };

      const nextAiBrain = trainAiBrainFromDeltas(state.aiBrain, {
        gameVersion: target.gameVersion,
        circuitId: target.circuitId,
        deltas: diagnosis.recommendedDiffs.map((d) => ({
          key: d.key,
          delta: d.next - d.previous,
        })),
        insightSummary: `${target.circuitName} AI Tune: ${diagnosis.intentSummary}`,
      });

      await commit({
        ...state,
        setups: state.setups.map((s) => (s.id === setupId ? updatedSetup : s)),
        feedbackLog: [feedbackEntry, ...state.feedbackLog].slice(0, 40),
        aiBrain: nextAiBrain,
      });

      return {
        setup: structuredClone(updatedSetup),
        diagnosis,
      };
    },

    async restoreSetupVersion(
      setupId: string,
      versionNumber: number
    ): Promise<SavedSetup & { versions: SetupVersionRecord[] }> {
      const state = await ensureState();
      const target = state.setups.find((s) => s.id === setupId);
      if (!target) throw new Error('Setup not found.');

      const ver = target.versions.find((v) => v.versionNumber === versionNumber);
      if (!ver) throw new Error('Target version not found.');

      const nextVersion = target.currentVersion + 1;
      const now = new Date().toISOString();

      const restoredRecord: SetupVersionRecord = {
        id: makeLocalId('ver'),
        setupId,
        versionNumber: nextVersion,
        parameters: ver.parameters,
        analysis: ver.analysis,
        feedbackApplied: [],
        feedbackNotes: `Restored from v${versionNumber}`,
        diffSummary: [],
        createdAt: now,
      };

      const updatedSetup: SavedSetup & { versions: SetupVersionRecord[] } = {
        ...target,
        currentVersion: nextVersion,
        parameters: ver.parameters,
        analysis: ver.analysis,
        updatedAt: now,
        versions: [restoredRecord, ...target.versions],
      };

      const nextAiBrain = trainAiBrainFromRestore(state.aiBrain, {
        gameVersion: target.gameVersion,
        circuitId: target.circuitId,
        restoredVersionNumber: versionNumber,
      });

      await commit({
        ...state,
        setups: state.setups.map((s) => (s.id === setupId ? updatedSetup : s)),
        aiBrain: nextAiBrain,
      });

      return structuredClone(updatedSetup);
    },

    async addParsedReference(payload: {
      title: string;
      sourceName: string;
      sourceUrl?: string;
      circuitId: string;
      gameVersion: GameVersion;
      weather: WeatherType;
      sessionType: SessionType;
      rawText: string;
    }): Promise<ResearchResult> {
      const state = await ensureState();
      const circuit = getCircuitById(payload.circuitId);
      const parsed = parseSetupTextToParameters(payload.rawText, payload.gameVersion);
      const now = new Date().toISOString();

      const entry: ResearchResult = {
        id: makeLocalId('ref'),
        sourceId: 'local_library',
        sourceName: payload.sourceName.trim() || 'Local Reference',
        sourceUrl: payload.sourceUrl?.trim() || 'local://setup-library',
        circuitId: circuit.id,
        circuitName: circuit.name,
        gameVersion: payload.gameVersion,
        weather: payload.weather,
        sessionType: payload.sessionType,
        title: payload.title.trim() || `${circuit.name} Reference Setup`,
        summary: parsed.summary,
        extractedParameters: parsed.extracted,
        collectedAt: now,
      };

      await commit({
        ...state,
        references: [entry, ...state.references].slice(0, 60),
      });

      return structuredClone(entry);
    },

    async deleteReference(refId: string): Promise<void> {
      const state = await ensureState();
      await commit({
        ...state,
        references: state.references.filter((r) => r.id !== refId),
      });
    },

    async recordOnlineCircuitLearning(payload: {
      webPayload: WebResearchPayload;
      weather: WeatherType;
    }): Promise<LocalAiBrain> {
      const state = await ensureState();
      const { webPayload, weather } = payload;
      const domains = Array.from(new Set(webPayload.webSources.map((s) => s.domain)));
      const baseline = generateSetup({
        gameVersion: webPayload.gameVersion,
        circuitId: webPayload.circuitId,
        weather,
        sessionType: 'race',
        profile: state.profiles[webPayload.gameVersion],
      }).parameters;

      const nextAiBrain = recordOnlineLearningIntoBrain(state.aiBrain, {
        circuitId: webPayload.circuitId,
        circuitName: webPayload.circuitName,
        gameVersion: webPayload.gameVersion,
        weather,
        consensusParameters: webPayload.consensusParameters,
        matchedParameterCount: webPayload.matchedParameterCount,
        domains,
        driverConsensusNote: webPayload.driverConsensusNote,
        sampleSizeNote: webPayload.sampleSizeNote,
        baselineParameters: baseline,
      });

      const committed = await commit({
        ...state,
        aiBrain: nextAiBrain,
      });
      return structuredClone(committed.aiBrain);
    },

    async recordAiFeedbackOutcome(payload: {
      gameVersion: GameVersion;
      circuitId: string;
      prompt: string;
      outcome: AiFeedbackOutcome;
    }): Promise<LocalAiBrain> {
      const state = await ensureState();
      const nextAiBrain = trainAiBrainFromFeedbackOutcome(state.aiBrain, payload);
      const committed = await commit({
        ...state,
        aiBrain: nextAiBrain,
      });
      return structuredClone(committed.aiBrain);
    },

    async saveSettings(patch: Partial<LocalAppSettings>): Promise<LocalAppSettings> {
      const state = await ensureState();
      const nextSettings: LocalAppSettings = {
        ...state.settings,
        ...patch,
      };
      await commit({
        ...state,
        settings: nextSettings,
      });
      return structuredClone(nextSettings);
    },

    async runAiOptimization(opts?: { keepVersionsPerSetup?: number }): Promise<OptimizationReport> {
      const state = await ensureState();
      const report = optimizeWorkspaceStorage(state, {
        keepVersionsPerSetup: opts?.keepVersionsPerSetup ?? 5,
      });
      await adapter.save(report.nextState);
      cachedState = report.nextState;
      return structuredClone(report);
    },

    async exportBackupJson(): Promise<string> {
      const state = await ensureState();
      return JSON.stringify(state, null, 2);
    },

    async importBackupJson(rawJson: string): Promise<LocalWorkspaceState> {
      const parsed = JSON.parse(rawJson) as Partial<LocalWorkspaceState>;
      const schemaVer = Number(parsed.schemaVersion);
      if (
        !parsed ||
        (schemaVer !== 3 && schemaVer !== 2) ||
        !parsed.profiles ||
        !Array.isArray(parsed.setups)
      ) {
        throw new Error('Invalid RS Setups backup JSON file.');
      }
      const migratedSetups = parsed.setups.map((s) => ({
        ...s,
        folderId: s.folderId || getDefaultFolderIdForVersion(s.gameVersion),
      }));
      const next: LocalWorkspaceState = {
        schemaVersion: 3,
        settings: {
          preferredGameVersion:
            parsed.settings?.preferredGameVersion ?? 'f1_25_2025',
          lastCircuitId: parsed.settings?.lastCircuitId ?? 'silverstone',
          reducedMotionOverride: parsed.settings?.reducedMotionOverride ?? 'system',
          githubRepo: parsed.settings?.githubRepo ?? '',
          autoLearnOnline: parsed.settings?.autoLearnOnline ?? true,
        },
        folders: ensureSystemFolders(parsed.folders),
        profiles: parsed.profiles,
        setups: migratedSetups,
        feedbackLog: Array.isArray(parsed.feedbackLog) ? parsed.feedbackLog : [],
        circuitNotes: Array.isArray(parsed.circuitNotes) ? parsed.circuitNotes : [],
        references: Array.isArray(parsed.references) ? parsed.references : [],
        aiBrain: parsed.aiBrain ?? createInitialAiBrain(),
        lastOptimizedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Ensure backup never exceeds 200 MB
      const optimized = optimizeWorkspaceStorage(next).nextState;
      return structuredClone(await commit(optimized));
    },

    async resetWorkspace(): Promise<LocalWorkspaceState> {
      await adapter.clear().catch(() => {});
      cachedState = null;
      return structuredClone(await ensureState());
    },

    getSoftCompactionThreshold() {
      return SOFT_COMPACTION_BYTES;
    },
  };
}

export const localStore = createLocalStore();
