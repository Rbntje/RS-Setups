import type {
  CircuitSpec,
  DrivingProfile,
  FeedbackTag,
  GameVersion,
  ResearchResult,
  SessionType,
  SetupParameters,
  SetupParameterKey,
  WeatherType,
} from '../types/setup';
import { CIRCUITS, GAME_VERSIONS, PARAMETER_ORDER, clampAndStep, formatParamValue } from './specs';
import { getCircuitById } from './generator';

export interface LearnedOnlineCircuitEntry {
  key: string;
  circuitId: string;
  circuitName: string;
  gameVersion: GameVersion;
  weather: WeatherType;
  consensusParameters: Partial<SetupParameters>;
  matchedParameterCount: number;
  domains: string[];
  driverConsensusNote: string | null;
  sampleSizeNote: string | null;
  learnedAt: string;
}

export interface AiLearningFeedItem {
  id: string;
  timestamp: string;
  kind: 'web_learn' | 'user_feedback' | 'setup_tune' | 'memory_compact';
  circuitName: string;
  summary: string;
  domains?: string[];
}

export type AiFeedbackOutcome =
  | 'helpful'
  | 'still_oversteer'
  | 'still_understeer'
  | 'too_slow';

export interface AiUserFeedbackRecord {
  circuitId: string;
  prompt: string;
  outcome: AiFeedbackOutcome;
  timestamp: string;
}

export interface LocalAiBrain {
  version: 1;
  learnedInteractions: number;
  globalStyleShifts: Partial<Record<SetupParameterKey, number>>;
  trackBiases: Record<string, Partial<Record<SetupParameterKey, number>>>;
  recentInsights: string[];
  onlineCircuitKnowledge?: Record<string, LearnedOnlineCircuitEntry>;
  learningFeed?: AiLearningFeedItem[];
  userFeedbackHistory?: AiUserFeedbackRecord[];
  updatedAt: string;
}

export interface AiDiagnosticDiff {
  key: SetupParameterKey;
  label: string;
  previous: number;
  next: number;
  formattedPrevious: string;
  formattedNext: string;
  reason: string;
}

export interface WebSourceItem {
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface AiChatTurn {
  role: 'user' | 'ai';
  text: string;
}

export interface CodedAiDiagnosis {
  intentSummary: string;
  detectedSymptoms: string[];
  searchedSources: string[];
  webSources?: WebSourceItem[];
  confidence: number;
  engineerReply: string;
  acknowledgedRequest?: string;
  followUpQuestion?: string;
  projectedImpacts: string[];
  recommendedDiffs: AiDiagnosticDiff[];
  nextParameters: SetupParameters;
  inferredTags: FeedbackTag[];
}

export const AI_QUICK_PROMPTS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'online_best',
    label: 'Best online meta',
    prompt: 'Check live F1 websites for what is fastest online and recommend the best setup',
  },
  {
    id: 'exit_snap',
    label: 'Snap on exit',
    prompt: 'Car snaps and oversteers when getting on the throttle out of corners',
  },
  {
    id: 'entry_understeer',
    label: 'Entry understeer',
    prompt: 'Front washes wide with understeer on corner entry',
  },
  {
    id: 'more_grip',
    label: 'More overall grip',
    prompt: 'Car slides mid-corner and needs more overall grip',
  },
  {
    id: 'top_speed',
    label: 'Need top speed',
    prompt: 'Too slow on the straights, I need more top speed',
  },
  {
    id: 'kerbs',
    label: 'Kerb bounce',
    prompt: 'Car bounces and loses balance riding over kerbs',
  },
  {
    id: 'explain_wings',
    label: 'Why these wings?',
    prompt: 'Explain why these wings, diff, and ride height were chosen for this track',
  },
];

export function createInitialAiBrain(): LocalAiBrain {
  return {
    version: 1,
    learnedInteractions: 0,
    globalStyleShifts: {},
    trackBiases: {},
    recentInsights: [],
    onlineCircuitKnowledge: {},
    learningFeed: [],
    userFeedbackHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getTrackBiasKey(gameVersion: GameVersion, circuitId: string): string {
  return `${gameVersion}:${circuitId}`;
}

export function getOnlineKnowledgeKey(
  gameVersion: GameVersion,
  circuitId: string,
  weather: WeatherType
): string {
  return `${gameVersion}:${circuitId}:${weather}`;
}

const MAX_PARAM_SHIFT: Partial<Record<SetupParameterKey, number>> = {
  frontWingAero: 6,
  rearWingAero: 6,
  diffAdjustmentOnThrottle: 15,
  diffAdjustmentOffThrottle: 15,
  engineBraking: 15,
  frontCamber: 0.4,
  rearCamber: 0.35,
  frontToeOut: 0.05,
  rearToeIn: 0.08,
  frontSuspension: 6,
  rearSuspension: 6,
  frontAntiRollBar: 4,
  rearAntiRollBar: 4,
  frontRideHeight: 4,
  rearRideHeight: 5,
  brakePressure: 5,
  frontBrakeBias: 3,
  frontRightTyrePressure: 0.8,
  frontLeftTyrePressure: 0.8,
  rearRightTyrePressure: 0.8,
  rearLeftTyrePressure: 0.8,
};

function clampBias(key: SetupParameterKey, value: number): number {
  const limit = MAX_PARAM_SHIFT[key] ?? 4;
  return Math.max(-limit, Math.min(limit, Number(value.toFixed(3))));
}

/**
 * Updates persistent on-device AI bias weights from driver feedback or applied AI tunes.
 * Strictly isolated per (gameVersion, circuitId) so 2025 Cars and 2026 Season Pack never mix.
 */
export function trainAiBrainFromDeltas(
  brain: LocalAiBrain,
  params: {
    gameVersion: GameVersion;
    circuitId: string;
    deltas: Array<{ key: SetupParameterKey; delta: number }>;
    insightSummary: string;
  }
): LocalAiBrain {
  const trackKey = getTrackBiasKey(params.gameVersion, params.circuitId);
  const nextTrack = { ...(brain.trackBiases[trackKey] ?? {}) };
  const nextGlobal = { ...brain.globalStyleShifts };

  for (const { key, delta } of params.deltas) {
    if (!Number.isFinite(delta) || delta === 0) continue;
    nextTrack[key] = clampBias(key, (nextTrack[key] ?? 0) * 0.9 + delta * 0.65);
    nextGlobal[key] = clampBias(key, (nextGlobal[key] ?? 0) * 0.92 + delta * 0.2);
  }

  const insights = params.insightSummary.trim()
    ? [params.insightSummary.trim(), ...brain.recentInsights].slice(0, 12)
    : brain.recentInsights;

  const feedEntry: AiLearningFeedItem = {
    id: `feed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    kind: 'setup_tune',
    circuitName: getCircuitById(params.circuitId).name,
    summary: params.insightSummary.trim() || `Learned ${params.deltas.length} delta weight(s)`,
  };

  return {
    ...brain,
    version: 1,
    learnedInteractions: brain.learnedInteractions + 1,
    globalStyleShifts: nextGlobal,
    trackBiases: {
      ...brain.trackBiases,
      [trackKey]: nextTrack,
    },
    recentInsights: insights,
    learningFeed: [feedEntry, ...(brain.learningFeed ?? [])].slice(0, 24),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Absorbs real live website consensus parameters locally on-device (never exceeding memory cap).
 */
export function recordOnlineLearningIntoBrain(
  brain: LocalAiBrain,
  params: {
    circuitId: string;
    circuitName: string;
    gameVersion: GameVersion;
    weather: WeatherType;
    consensusParameters: Partial<SetupParameters>;
    matchedParameterCount: number;
    domains: string[];
    driverConsensusNote: string | null;
    sampleSizeNote: string | null;
    baselineParameters?: SetupParameters;
  }
): LocalAiBrain {
  const key = getOnlineKnowledgeKey(params.gameVersion, params.circuitId, params.weather);
  const now = new Date().toISOString();

  const existingKnowledge = { ...(brain.onlineCircuitKnowledge ?? {}) };
  existingKnowledge[key] = {
    key,
    circuitId: params.circuitId,
    circuitName: params.circuitName,
    gameVersion: params.gameVersion,
    weather: params.weather,
    consensusParameters: params.consensusParameters,
    matchedParameterCount: params.matchedParameterCount,
    domains: params.domains.slice(0, 4),
    driverConsensusNote: params.driverConsensusNote,
    sampleSizeNote: params.sampleSizeNote,
    learnedAt: now,
  };

  // Keep max 48 entries sorted newest first so local phone memory stays ultra-lean
  const sortedEntries = Object.values(existingKnowledge)
    .sort((a, b) => b.learnedAt.localeCompare(a.learnedAt))
    .slice(0, 48);
  const compactedKnowledge: Record<string, LearnedOnlineCircuitEntry> = {};
  for (const item of sortedEntries) {
    compactedKnowledge[item.key] = item;
  }

  // Gently train subtle track bias weights when baseline is available (max 12% pull so user safety holds)
  const trackKey = getTrackBiasKey(params.gameVersion, params.circuitId);
  const nextTrack = { ...(brain.trackBiases[trackKey] ?? {}) };
  if (params.baselineParameters && params.matchedParameterCount >= 6) {
    for (const pKey of PARAMETER_ORDER) {
      const onlineVal = params.consensusParameters[pKey];
      if (onlineVal === undefined) continue;
      const diff = onlineVal - params.baselineParameters[pKey];
      if (Math.abs(diff) > 0.01) {
        nextTrack[pKey] = clampBias(pKey, (nextTrack[pKey] ?? 0) * 0.75 + diff * 0.14);
      }
    }
  }

  const domainSummary = params.domains.slice(0, 2).join(', ') || 'online web';
  const insight = `Online learned ${params.circuitName} (${params.gameVersion === 'f1_25_2026_pack' ? '2026' : '2025'} ${params.weather}): ${params.matchedParameterCount} params from ${domainSummary}`;

  const feedEntry: AiLearningFeedItem = {
    id: `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    kind: 'web_learn',
    circuitName: params.circuitName,
    summary:
      params.driverConsensusNote ||
      `Synced ${params.matchedParameterCount} fastest-driver params (${params.weather.toUpperCase()})`,
    domains: params.domains.slice(0, 3),
  };

  return {
    ...brain,
    version: 1,
    learnedInteractions: brain.learnedInteractions + 1,
    trackBiases: {
      ...brain.trackBiases,
      [trackKey]: nextTrack,
    },
    onlineCircuitKnowledge: compactedKnowledge,
    recentInsights: [insight, ...brain.recentInsights].slice(0, 12),
    learningFeed: [feedEntry, ...(brain.learningFeed ?? [])].slice(0, 24),
    updatedAt: now,
  };
}

/**
 * Trains local AI from direct user feedback on an AI recommendation ("helpful", "still oversteer", etc.).
 */
export function trainAiBrainFromFeedbackOutcome(
  brain: LocalAiBrain,
  params: {
    gameVersion: GameVersion;
    circuitId: string;
    prompt: string;
    outcome: AiFeedbackOutcome;
  }
): LocalAiBrain {
  const now = new Date().toISOString();
  const trackKey = getTrackBiasKey(params.gameVersion, params.circuitId);
  const nextTrack = { ...(brain.trackBiases[trackKey] ?? {}) };
  const nextGlobal = { ...brain.globalStyleShifts };
  const circuit = getCircuitById(params.circuitId);

  const nudgeWeight = (key: SetupParameterKey, trackDelta: number, globalDelta: number) => {
    nextTrack[key] = clampBias(key, (nextTrack[key] ?? 0) + trackDelta);
    nextGlobal[key] = clampBias(key, (nextGlobal[key] ?? 0) + globalDelta);
  };

  let label = 'Saved helpful preference';
  if (params.outcome === 'still_oversteer') {
    nudgeWeight('rearWingAero', 1.5, 0.4);
    nudgeWeight('diffAdjustmentOnThrottle', -4, -1.5);
    nudgeWeight('rearAntiRollBar', -1, -0.3);
    label = 'Driver still felt oversteer → stronger rear stability weight saved';
  } else if (params.outcome === 'still_understeer') {
    nudgeWeight('frontWingAero', 1.5, 0.4);
    nudgeWeight('diffAdjustmentOffThrottle', -4, -1.5);
    nudgeWeight('frontAntiRollBar', -1, -0.3);
    label = 'Driver still felt understeer → sharper front bite weight saved';
  } else if (params.outcome === 'too_slow') {
    nudgeWeight('frontWingAero', -1.5, -0.4);
    nudgeWeight('rearWingAero', -1.5, -0.4);
    label = 'Driver wanted more straight speed → lower aero drag bias saved';
  } else {
    label = `Confirmed setup felt great at ${circuit.name}`;
  }

  const fbRecord: AiUserFeedbackRecord = {
    circuitId: params.circuitId,
    prompt: params.prompt.slice(0, 140),
    outcome: params.outcome,
    timestamp: now,
  };

  const feedEntry: AiLearningFeedItem = {
    id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    kind: 'user_feedback',
    circuitName: circuit.name,
    summary: label,
  };

  return {
    ...brain,
    version: 1,
    learnedInteractions: brain.learnedInteractions + 1,
    globalStyleShifts: nextGlobal,
    trackBiases: {
      ...brain.trackBiases,
      [trackKey]: nextTrack,
    },
    userFeedbackHistory: [fbRecord, ...(brain.userFeedbackHistory ?? [])].slice(0, 25),
    recentInsights: [`Feedback (${circuit.name}): ${label}`, ...brain.recentInsights].slice(0, 12),
    learningFeed: [feedEntry, ...(brain.learningFeed ?? [])].slice(0, 24),
    updatedAt: now,
  };
}

/**
 * Negative reinforcement when a driver explicitly rolls back to an older version.
 */
export function trainAiBrainFromRestore(
  brain: LocalAiBrain,
  params: { gameVersion: GameVersion; circuitId: string; restoredVersionNumber: number }
): LocalAiBrain {
  const trackKey = getTrackBiasKey(params.gameVersion, params.circuitId);
  const prevTrack = brain.trackBiases[trackKey];
  if (!prevTrack) {
    return {
      ...brain,
      recentInsights: [
        `Rolled back to v${params.restoredVersionNumber} on ${params.circuitId} (${params.gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Cars'})`,
        ...brain.recentInsights,
      ].slice(0, 12),
      updatedAt: new Date().toISOString(),
    };
  }

  const cooledTrack: Partial<Record<SetupParameterKey, number>> = {};
  for (const [k, v] of Object.entries(prevTrack) as Array<[SetupParameterKey, number]>) {
    cooledTrack[k] = Number((v * 0.6).toFixed(3));
  }

  return {
    ...brain,
    trackBiases: {
      ...brain.trackBiases,
      [trackKey]: cooledTrack,
    },
    recentInsights: [
      `Cooled aggressive track weights after restoring v${params.restoredVersionNumber}`,
      ...brain.recentInsights,
    ].slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
}

type SymptomId =
  | 'exit_oversteer'
  | 'entry_oversteer'
  | 'mid_oversteer'
  | 'entry_understeer'
  | 'mid_understeer'
  | 'exit_understeer'
  | 'braking_lockup'
  | 'lack_top_speed'
  | 'lack_traction'
  | 'kerb_instability'
  | 'tyre_overheat'
  | 'wet_grip'
  | 'more_grip'
  | 'faster_rotation'
  | 'calmer_car'
  | 'explain_setup';

interface SymptomMatch {
  id: SymptomId;
  label: string;
  score: number;
}

const SYMPTOM_PATTERNS: Array<{
  id: SymptomId;
  label: string;
  keywords: Array<[string, number]>;
}> = [
  {
    id: 'explain_setup',
    label: 'Setup explanation',
    keywords: [
      ['explain', 3.5],
      ['why', 3],
      ['waarom', 3.5],
      ['uitleg', 3.5],
      ['leg uit', 3.5],
      ['wat doet', 3.2],
      ['what does', 3.2],
      ['overview', 2.5],
      ['breakdown', 3],
      ['is this good', 3],
      ['is dit goed', 3.2],
      ['how is', 2.4],
      ['hoe is', 2.4],
    ],
  },
  {
    id: 'exit_oversteer',
    label: 'Exit oversteer / throttle snap',
    keywords: [
      ['snap', 3],
      ['oversteer', 2.2],
      ['overstuur', 2.4],
      ['spin', 2.5],
      ['uitbreekt', 3.5],
      ['breekt uit', 3.5],
      ['loose rear', 2.8],
      ['rear steps out', 3.2],
      ['achterkant', 2],
      ['throttle', 1.6],
      ['gas', 1.6],
      ['exit', 1.6],
      ['glijdt weg', 2.8],
    ],
  },
  {
    id: 'entry_oversteer',
    label: 'Entry instability / turn-in oversteer',
    keywords: [
      ['entry oversteer', 3.5],
      ['turn-in snap', 3.5],
      ['insturen overstuur', 3.5],
      ['loose on entry', 3.2],
      ['trail braking', 2.6],
      ['downshift', 2.2],
      ['entry', 1.4],
      ['insturen', 1.5],
    ],
  },
  {
    id: 'mid_oversteer',
    label: 'Mid-corner rear slip',
    keywords: [
      ['mid corner oversteer', 3.5],
      ['mid-corner oversteer', 3.5],
      ['apex snap', 3],
      ['high speed corner', 2.4],
      ['snelle bocht', 2.4],
    ],
  },
  {
    id: 'entry_understeer',
    label: 'Entry understeer / sluggish turn-in',
    keywords: [
      ['understeer', 2.4],
      ['onderstuur', 2.5],
      ['wash wide', 3.2],
      ['pushes wide', 3.2],
      ['wijd', 2.2],
      ['no turn in', 3.2],
      ['turn-in', 2.2],
      ['stuurt niet', 3.2],
      ['zwaar sturen', 2.8],
      ['entry', 1.3],
      ['insturen', 1.4],
    ],
  },
  {
    id: 'mid_understeer',
    label: 'Mid-corner understeer',
    keywords: [
      ['mid corner understeer', 3.5],
      ['mid-corner understeer', 3.5],
      ['missed apex', 2.6],
      ['front washes', 2.6],
      ['apex', 1.6],
    ],
  },
  {
    id: 'exit_understeer',
    label: 'Exit understeer / power push',
    keywords: [
      ['exit understeer', 3.5],
      ['on power understeer', 3.5],
      ['uitkomen onderstuur', 3.5],
      ['push on exit', 3.2],
    ],
  },
  {
    id: 'braking_lockup',
    label: 'Braking lock-up & stability',
    keywords: [
      ['lock up', 3.5],
      ['lock-up', 3.5],
      ['locking', 3],
      ['blokkeer', 3.5],
      ['blokkeren', 3.5],
      ['brake', 2.2],
      ['braking', 2.4],
      ['remmen', 2.8],
      ['remweg', 2.8],
      ['rem', 2.2],
    ],
  },
  {
    id: 'lack_top_speed',
    label: 'Straight-line top speed deficit',
    keywords: [
      ['top speed', 3.5],
      ['topsnelheid', 3.5],
      ['straight', 2.4],
      ['rechte stuk', 3.2],
      ['drag', 2.6],
      ['slow on straight', 3.5],
      ['drs', 2.2],
      ['sneller op recht', 3.2],
      ['langzaam op het rechte', 3.5],
    ],
  },
  {
    id: 'lack_traction',
    label: 'Corner-exit traction loss',
    keywords: [
      ['traction', 3.2],
      ['tractie', 3.2],
      ['wheelspin', 3.4],
      ['spinnen', 2.6],
      ['no grip on exit', 3.2],
      ['acceleration', 2.2],
      ['uitaccelereren', 3.2],
    ],
  },
  {
    id: 'kerb_instability',
    label: 'Kerb bounce & platform unsettlement',
    keywords: [
      ['kerb', 3.5],
      ['kerbs', 3.5],
      ['curb', 3.5],
      ['curbs', 3.5],
      ['bounce', 3.2],
      ['stuitert', 3.5],
      ['bump', 2.6],
      ['hobbels', 3.2],
      ['bottoming', 3.2],
      ['bodem', 2.8],
    ],
  },
  {
    id: 'tyre_overheat',
    label: 'Tyre overheating & stint wear',
    keywords: [
      ['tyre', 2.2],
      ['tyres', 2.2],
      ['tire', 2.2],
      ['tires', 2.2],
      ['banden', 2.6],
      ['overheat', 3.5],
      ['heet', 2.6],
      ['warm', 2.2],
      ['wear', 3.2],
      ['slijt', 3.5],
      ['slijtage', 3.5],
      ['stint', 2.2],
      ['deg', 2.6],
    ],
  },
  {
    id: 'wet_grip',
    label: 'Wet weather confidence & standing water',
    keywords: [
      ['wet', 3.2],
      ['rain', 3.4],
      ['regen', 3.5],
      ['nat', 3.2],
      ['inters', 2.6],
      ['intermediate', 2.6],
      ['aquaplane', 3.5],
    ],
  },
  {
    id: 'more_grip',
    label: 'Overall cornering grip boost',
    keywords: [
      ['meer grip', 3.5],
      ['more grip', 3.5],
      ['weinig grip', 3.5],
      ['low grip', 3.5],
      ['geen grip', 3.5],
      ['glijdt', 2.8],
      ['slides', 2.8],
      ['bochten', 2.4],
      ['cornering', 2.6],
      ['downforce', 2.6],
    ],
  },
  {
    id: 'faster_rotation',
    label: 'Sharper turn-in & qualifying pace',
    keywords: [
      ['sneller', 2.4],
      ['faster', 2.4],
      ['scherper', 3],
      ['sharper', 3],
      ['responsive', 2.8],
      ['quali', 2.6],
      ['rondetijd', 2.8],
      ['lap time', 2.8],
      ['aggressive', 2.4],
      ['agressiever', 2.6],
    ],
  },
  {
    id: 'calmer_car',
    label: 'Calmer stability & driver confidence',
    keywords: [
      ['stabieler', 3.4],
      ['more stable', 3.4],
      ['stability', 2.8],
      ['veilig', 2.6],
      ['safer', 2.8],
      ['nerveus', 3.4],
      ['twitchy', 3.4],
      ['onrustig', 3.2],
      ['consistent', 2.8],
    ],
  },
];

function isDutchText(text: string): boolean {
  return /\b(ik|mijn|de|het|een|bij|voor|naar|waarom|onderstuur|overstuur|achterkant|voorkant|banden|remmen|bocht|bochten|sneller|meer|minder|stabieler|stuitert|topsnelheid|rechte|uitleg|leg uit|goed|kan|graag|zoek|vind|welke|wat|hoe|tips|advies|nog|steeds|helpt|niet|hetzelfde|probleem|auto|voel|voelt|zet|pas|vleugel|balans|vering|rijhoogte|bandenspanning|breekt)\b/i.test(
    text
  );
}

const CIRCUIT_ALIASES: Record<string, string[]> = {
  albert_park: ['albert park', 'melbourne', 'australia', 'australie', 'australië'],
  shanghai: ['shanghai', 'china'],
  suzuka: ['suzuka', 'japan'],
  bahrain: ['bahrain', 'bahrein', 'sakhir'],
  jeddah: ['jeddah', 'saudi', 'djedda'],
  miami: ['miami'],
  imola: ['imola', 'emilia'],
  monaco: ['monaco', 'monte carlo'],
  barcelona: ['barcelona', 'catalunya', 'spain', 'spanje'],
  montreal: ['montreal', 'canada', 'gilles'],
  red_bull_ring: ['red bull ring', 'spielberg', 'austria', 'oostenrijk'],
  silverstone: ['silverstone', 'uk', 'britain', 'engeland'],
  spa: ['spa', 'francorchamps', 'belgium', 'belgie', 'belgië'],
  hungaroring: ['hungaroring', 'hungary', 'hongarije', 'budapest'],
  zandvoort: ['zandvoort', 'netherlands', 'nederland'],
  monza: ['monza', 'italy', 'italie', 'italië'],
  baku: ['baku', 'azerbaijan', 'azerbeidzjan'],
  marina_bay: ['marina bay', 'singapore'],
  austin: ['austin', 'cota', 'americas', 'usa'],
  mexico: ['mexico', 'hermanos'],
  interlagos: ['interlagos', 'brazil', 'brazilie', 'brazilië', 'sao paulo'],
  las_vegas: ['vegas', 'las vegas'],
  lusail: ['lusail', 'qatar'],
  yas_marina: ['yas marina', 'abu dhabi', 'uae'],
};

export function findMentionedCircuit(prompt: string): CircuitSpec | null {
  const lower = prompt.toLowerCase();
  for (const circuit of CIRCUITS) {
    const aliases = CIRCUIT_ALIASES[circuit.id] ?? [circuit.name.toLowerCase()];
    if (
      aliases.some((alias) => lower.includes(alias)) ||
      lower.includes(circuit.name.toLowerCase()) ||
      lower.includes(circuit.id.replace(/_/g, ' '))
    ) {
      return circuit;
    }
  }
  return null;
}

function searchMatchingLibraryReferences(
  prompt: string,
  targetCircuit: CircuitSpec,
  references: ResearchResult[]
): ResearchResult[] {
  if (references.length === 0) return [];
  const lower = prompt.toLowerCase();
  const terms = lower.split(/\s+/).filter((t) => t.length >= 3);

  const scored = references
    .map((ref) => {
      let score = 0;
      if (ref.circuitId === targetCircuit.id) score += 5;
      const hay = `${ref.title} ${ref.sourceName} ${ref.summary} ${ref.circuitName}`.toLowerCase();
      for (const term of terms) {
        if (hay.includes(term)) score += 2;
      }
      return { ref, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 2).map((entry) => entry.ref);
}

interface DirectParamCommand {
  key: SetupParameterKey;
  mode: 'set' | 'delta';
  value: number;
  reason: string;
}

const PARAM_ALIAS_MAP: Array<{ key: SetupParameterKey; patterns: RegExp[]; defaultStep: number }> = [
  {
    key: 'frontWingAero',
    patterns: [/front wing/i, /voorvleugel/i, /voor vleugel/i, /front aero/i],
    defaultStep: 2,
  },
  {
    key: 'rearWingAero',
    patterns: [/rear wing/i, /achtervleugel/i, /achter vleugel/i, /rear aero/i],
    defaultStep: 2,
  },
  {
    key: 'diffAdjustmentOnThrottle',
    patterns: [/on throttle/i, /on-throttle/i, /on throttle diff/i, /diff on/i],
    defaultStep: 5,
  },
  {
    key: 'diffAdjustmentOffThrottle',
    patterns: [/off throttle/i, /off-throttle/i, /diff off/i],
    defaultStep: 5,
  },
  {
    key: 'engineBraking',
    patterns: [/engine braking/i, /motorrem/i],
    defaultStep: 10,
  },
  {
    key: 'frontRideHeight',
    patterns: [/front ride/i, /voor rijhoogte/i, /rijhoogte voor/i],
    defaultStep: 2,
  },
  {
    key: 'rearRideHeight',
    patterns: [/rear ride/i, /achter rijhoogte/i, /rijhoogte achter/i],
    defaultStep: 2,
  },
  {
    key: 'brakePressure',
    patterns: [/brake pressure/i, /remdruk/i],
    defaultStep: 2,
  },
  {
    key: 'frontBrakeBias',
    patterns: [/brake bias/i, /rembalans/i, /rem bias/i],
    defaultStep: 1,
  },
  {
    key: 'frontSuspension',
    patterns: [/front suspension/i, /voorvering/i, /voor vering/i],
    defaultStep: 2,
  },
  {
    key: 'rearSuspension',
    patterns: [/rear suspension/i, /achtervering/i, /achter vering/i],
    defaultStep: 2,
  },
  {
    key: 'frontAntiRollBar',
    patterns: [/front arb/i, /front anti[- ]?roll/i, /voor arb/i],
    defaultStep: 2,
  },
  {
    key: 'rearAntiRollBar',
    patterns: [/rear arb/i, /rear anti[- ]?roll/i, /achter arb/i],
    defaultStep: 2,
  },
];

function parseDirectParameterCommands(prompt: string): DirectParamCommand[] {
  const lower = prompt.toLowerCase();
  const commands: DirectParamCommand[] = [];

  for (const entry of PARAM_ALIAS_MAP) {
    const matchedPattern = entry.patterns.find((p) => p.test(lower));
    if (!matchedPattern) continue;

    // Look for an explicit number right around the parameter name (e.g. "voorvleugel naar 28" or "brake pressure 96%")
    const idx = lower.search(matchedPattern);
    const windowSlice = lower.slice(Math.max(0, idx), Math.min(lower.length, idx + 48));
    const explicitNumMatch = windowSlice.match(
      /(?:to|naar|op|at|=|:)?\s*(-?\d+(?:[.,]\d+)?)\s*%?/
    );
    if (explicitNumMatch) {
      const val = Number(explicitNumMatch[1].replace(',', '.'));
      if (Number.isFinite(val)) {
        commands.push({
          key: entry.key,
          mode: 'set',
          value: val,
          reason: 'Set directly from your request',
        });
        continue;
      }
    }

    // Otherwise check relative direction ("meer/more/higher/stiffer" vs "minder/less/lower/softer")
    const prevContext = lower.slice(Math.max(0, idx - 22), Math.min(lower.length, idx + 44));
    if (/\b(more|meer|higher|hoger|increase|verhoog|up|omhoog|stiffer|stijver|add)\b/.test(prevContext)) {
      commands.push({
        key: entry.key,
        mode: 'delta',
        value: entry.defaultStep,
        reason: 'Increased per your request',
      });
    } else if (
      /\b(less|minder|lower|lager|decrease|verlaag|down|omlaag|softer|zachter|drop|reduce)\b/.test(
        prevContext
      )
    ) {
      commands.push({
        key: entry.key,
        mode: 'delta',
        value: -entry.defaultStep,
        reason: 'Reduced per your request',
      });
    }
  }

  // Handle general wing/downforce requests when neither front nor rear was explicitly singled out
  if (commands.length === 0) {
    if (/\b(minder wing|less wing|minder downforce|less downforce|minder vleugel|less aero)\b/i.test(lower)) {
      commands.push(
        { key: 'frontWingAero', mode: 'delta', value: -2, reason: 'Reduced front aero per your request' },
        { key: 'rearWingAero', mode: 'delta', value: -2, reason: 'Reduced rear aero per your request' }
      );
    } else if (/\b(meer wing|more wing|meer downforce|more downforce|meer vleugel|more aero)\b/i.test(lower)) {
      commands.push(
        { key: 'frontWingAero', mode: 'delta', value: 2, reason: 'Added front aero per your request' },
        { key: 'rearWingAero', mode: 'delta', value: 2, reason: 'Added rear aero per your request' }
      );
    } else if (/\b(hogere rijhoogte|higher ride height|raise ride)\b/i.test(lower)) {
      commands.push(
        { key: 'frontRideHeight', mode: 'delta', value: 2, reason: 'Raised front floor clearance per your request' },
        { key: 'rearRideHeight', mode: 'delta', value: 2, reason: 'Raised rear floor clearance per your request' }
      );
    } else if (/\b(lagere rijhoogte|lower ride height|drop ride)\b/i.test(lower)) {
      commands.push(
        { key: 'frontRideHeight', mode: 'delta', value: -2, reason: 'Lowered front floor clearance per your request' },
        { key: 'rearRideHeight', mode: 'delta', value: -2, reason: 'Lowered rear floor clearance per your request' }
      );
    } else if (/\b(bandenspanning omlaag|lower tyre pressure|lower tire pressure)\b/i.test(lower)) {
      commands.push(
        { key: 'frontLeftTyrePressure', mode: 'delta', value: -0.2, reason: 'Dropped FL psi per your request' },
        { key: 'frontRightTyrePressure', mode: 'delta', value: -0.2, reason: 'Dropped FR psi per your request' },
        { key: 'rearLeftTyrePressure', mode: 'delta', value: -0.2, reason: 'Dropped RL psi per your request' },
        { key: 'rearRightTyrePressure', mode: 'delta', value: -0.2, reason: 'Dropped RR psi per your request' }
      );
    }
  }

  return commands;
}

function classifyPromptSymptoms(
  rawPrompt: string,
  conversationHistory?: AiChatTurn[]
): {
  matches: SymptomMatch[];
  intensity: number;
  wantsQuestionOnly: boolean;
  isFollowUpEscalation: boolean;
  isPositiveFeedback: boolean;
} {
  const text = rawPrompt.toLowerCase().trim();
  if (!text) {
    return {
      matches: [{ id: 'explain_setup', label: 'Setup explanation', score: 1 }],
      intensity: 1,
      wantsQuestionOnly: true,
      isFollowUpEscalation: false,
      isPositiveFeedback: false,
    };
  }

  const isPositiveFeedback =
    /\b(works well|werkt goed|beter|perfect|top|bedankt|thanks|heerlijk|fijn|lekker|nice|goed zo)\b/i.test(
      text
    ) && !/(niet goed|niet beter|nog steeds|still|bad|slecht)/i.test(text);

  const isFollowUpEscalation =
    /\b(nog steeds|still|helpt niet|werkt niet|not helping|didn't work|did not work|luistert niet|luister|eigenlijk nog|iets meer|een beetje meer|even more|again|opnieuw)\b/i.test(
      text
    );

  let intensity = 1.0;
  if (/(slight|a bit|little|mild|beetje|licht|klein)/.test(text)) {
    intensity = 0.7;
  } else if (/(massive|huge|very|terrible|lot|heavy|erg|veel|enorm|zwaar|constant)/.test(text)) {
    intensity = 1.45;
  }
  if (isFollowUpEscalation) {
    intensity = Math.max(intensity, 1.35);
  }

  const wantsQuestionOnly =
    /\b(explain|why|waarom|uitleg|leg uit|what does|wat doet|what is|wat is|wat weet|wat zijn|vertel|tell me|overview|breakdown|hoe werkt|welke|tips|info|advies|zoek|vind|look up|lookup)\b/i.test(
      text
    ) &&
    !/(fix|change|tune|verander|pas aan|maak|zet|give me|geef|meer|minder|sneller|understeer|onderstuur|oversteer|overstuur|snap|bounce|stuitert|lock|glijdt|slide|overheat|heet)/i.test(
      text
    );

  const hasEntry = /(entry|turn in|turn-in|insturen|remzone)/.test(text);
  const hasExit = /(exit|throttle|power|uitkomen|gas)/.test(text);
  const hasMid = /(mid|apex|midden)/.test(text);

  const scored: SymptomMatch[] = [];
  for (const pat of SYMPTOM_PATTERNS) {
    let score = 0;
    for (const [kw, w] of pat.keywords) {
      if (text.includes(kw)) score += w;
    }
    if (pat.id === 'exit_oversteer' && hasExit && /(oversteer|overstuur|snap|spin|loose|breekt)/.test(text)) {
      score += 2.2;
    }
    if (pat.id === 'entry_oversteer' && hasEntry && /(oversteer|overstuur|loose|snap)/.test(text)) {
      score += 2.2;
    }
    if (pat.id === 'entry_understeer' && hasEntry && /(understeer|onderstuur|wide|wijd)/.test(text)) {
      score += 2.2;
    }
    if (pat.id === 'mid_understeer' && hasMid && /(understeer|onderstuur|wide|apex)/.test(text)) {
      score += 2.2;
    }
    if (score >= 2.0) {
      scored.push({ id: pat.id, label: pat.label, score });
    }
  }

  // If user says "doe nog meer" / "helpt niet" without repeating symptom, check previous user turn!
  if (scored.length === 0 && isFollowUpEscalation && conversationHistory && conversationHistory.length > 0) {
    const prevUserTurns = conversationHistory.filter((t) => t.role === 'user');
    const lastUserTurn = prevUserTurns[prevUserTurns.length - 1];
    if (lastUserTurn && lastUserTurn.text.toLowerCase() !== text) {
      const inherited = classifyPromptSymptoms(lastUserTurn.text, undefined);
      for (const m of inherited.matches) {
        if (m.id !== 'explain_setup') {
          scored.push({ ...m, score: m.score + 0.5 });
        }
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (wantsQuestionOnly) {
    return {
      matches: [{ id: 'explain_setup', label: 'Setup explanation', score: 10 }],
      intensity,
      wantsQuestionOnly: true,
      isFollowUpEscalation,
      isPositiveFeedback,
    };
  }

  const actionable = scored.filter((m) => m.id !== 'explain_setup');
  return {
    matches: actionable.length > 0 ? actionable.slice(0, 3) : scored.slice(0, 2),
    intensity,
    wantsQuestionOnly: false,
    isFollowUpEscalation,
    isPositiveFeedback,
  };
}

function buildDetailedExplanation(input: {
  prompt: string;
  circuit: CircuitSpec;
  mentionedCircuit: CircuitSpec | null;
  matchedRefs: ResearchResult[];
  learnedOnline: LearnedOnlineCircuitEntry | null;
  gameVersion: GameVersion;
  weather: WeatherType;
  params: SetupParameters;
  profile: DrivingProfile;
  learnedCount: number;
}): { reply: string; impacts: string[] } {
  const {
    prompt,
    circuit,
    mentionedCircuit,
    matchedRefs,
    learnedOnline,
    gameVersion,
    weather,
    params,
    profile,
    learnedCount,
  } = input;
  const target = mentionedCircuit ?? circuit;
  const dutch = isDutchText(prompt);
  const lower = prompt.toLowerCase();
  const avgWing = Math.round((params.frontWingAero + params.rearWingAero) / 2);
  const rake = params.rearRideHeight - params.frontRideHeight;
  const specs = GAME_VERSIONS[gameVersion].parameters;
  const specLabel = gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Spec';

  const parts: string[] = [];

  if (
    (mentionedCircuit && mentionedCircuit.id !== circuit.id) ||
    /(zoek|vind|look up|lookup|wat weet|vertel|info|tips)/.test(lower)
  ) {
    parts.push(
      dutch
        ? `Opgezocht in circuitdatabase: ${target.name} (R${target.round}, ${target.lengthKm.toFixed(2)} km) — ${target.downforceDemand}/10 downforce, ${target.topSpeedPriority}/10 topsnelheid, ${target.kerbSeverity}/10 kerbs, ${target.tyreStress}/10 bandenslijtage. ${target.engineeringNotes}`
        : `Looked up ${target.name} (R${target.round}, ${target.lengthKm.toFixed(2)} km): ${target.downforceDemand}/10 downforce, ${target.topSpeedPriority}/10 top speed, ${target.kerbSeverity}/10 kerbs, ${target.tyreStress}/10 tyre stress. ${target.engineeringNotes}`
    );
  }

  if (/(wing|aero|vleugel)/.test(lower) || !/(diff|camber|toe|ride|rijhoogte|brake|rem|tyre|band|suspension|vering)/.test(lower)) {
    parts.push(
      dutch
        ? `Voor ${target.name} (${specLabel}, ${weather.toUpperCase()}) staan je vleugels op ${params.frontWingAero}/${params.rearWingAero} (bereik ${specs.frontWingAero.min}–${specs.frontWingAero.max}, gemiddeld ${avgWing}). Dat past bij ${target.downforceDemand}/10 bochtendruk en ${target.topSpeedPriority}/10 topsnelheid.`
        : `${target.name} (${specLabel}, ${weather.toUpperCase()}) runs ${params.frontWingAero}/${params.rearWingAero} wings (range ${specs.frontWingAero.min}–${specs.frontWingAero.max}, avg ${avgWing}), balancing ${target.downforceDemand}/10 cornering load against ${target.topSpeedPriority}/10 straight-line priority.`
    );
  }
  if (/(diff|transmission|throttle|off)/.test(lower)) {
    parts.push(
      dutch
        ? `Je differentieel staat op ${params.diffAdjustmentOnThrottle}% on-throttle en ${params.diffAdjustmentOffThrottle}% off-throttle (bereik ${specs.diffAdjustmentOnThrottle.min}–${specs.diffAdjustmentOnThrottle.max}%) om tractie bij uitkomen te houden zonder plotselinge overstuur.`
        : `Differential sits at ${params.diffAdjustmentOnThrottle}% on-throttle / ${params.diffAdjustmentOffThrottle}% off-throttle (${specs.diffAdjustmentOnThrottle.min}–${specs.diffAdjustmentOnThrottle.max}%) for controlled exit drive and entry rotation.`
    );
  }
  if (/(camber|toe)/.test(lower)) {
    parts.push(
      dutch
        ? `Geometrie: camber voor/achter ${params.frontCamber}° / ${params.rearCamber}° en toe ${params.frontToeOut}° / ${params.rearToeIn}°. Meer negatieve camber geeft extra bochtengrip maar warmt banden sneller op.`
        : `Geometry runs ${params.frontCamber}° / ${params.rearCamber}° camber and ${params.frontToeOut}° / ${params.rearToeIn}° toe within ${specLabel} bounds.`
    );
  }
  if (/(ride|height|rijhoogte|kerb|rake|suspension|vering|arb)/.test(lower)) {
    parts.push(
      dutch
        ? `Vering is ${params.frontSuspension}/${params.rearSuspension} met ${params.frontRideHeight}/${params.rearRideHeight}mm rijhoogte (${rake}mm rake) afgestemd op ${target.kerbSeverity}/10 kerb-belasting.`
        : `Suspension runs ${params.frontSuspension}/${params.rearSuspension} with ${params.frontRideHeight}/${params.rearRideHeight}mm ride height (${rake}mm rake) tuned for ${target.kerbSeverity}/10 kerb severity.`
    );
  }
  if (/(brake|rem|tyre|band|pressure|spanning)/.test(lower)) {
    parts.push(
      dutch
        ? `Remdruk is ${params.brakePressure}% (bias ${params.frontBrakeBias}% voor) en bandenspanning ${params.frontLeftTyrePressure} / ${params.rearLeftTyrePressure} psi voor stabiele temperatuur.`
        : `Brakes sit at ${params.brakePressure}% pressure (${params.frontBrakeBias}% front bias) with ${params.frontLeftTyrePressure}/${params.rearLeftTyrePressure} psi pressures targeting ${profile.rearStability}/10 rear stability.`
    );
  }
  if (learnedOnline && learnedOnline.matchedParameterCount > 0) {
    parts.push(
      dutch
        ? `Lokaal opgeslagen online kennis (${learnedOnline.domains.join(', ')}): ${learnedOnline.matchedParameterCount} top-rijdersparameters geleerd${learnedOnline.driverConsensusNote ? ` (${learnedOnline.driverConsensusNote})` : ''}.`
        : `Locally learned online consensus (${learnedOnline.domains.join(', ')}): ${learnedOnline.matchedParameterCount} parameters synced${learnedOnline.driverConsensusNote ? ` (${learnedOnline.driverConsensusNote})` : ''}.`
    );
  }
  if (matchedRefs.length > 0) {
    const topRef = matchedRefs[0];
    const refAero =
      topRef.extractedParameters.frontWingAero !== undefined &&
      topRef.extractedParameters.rearWingAero !== undefined
        ? `${topRef.extractedParameters.frontWingAero}/${topRef.extractedParameters.rearWingAero}`
        : 'balanced aero';
    const refDiff =
      topRef.extractedParameters.diffAdjustmentOnThrottle !== undefined &&
      topRef.extractedParameters.diffAdjustmentOffThrottle !== undefined
        ? `${topRef.extractedParameters.diffAdjustmentOnThrottle}%/${topRef.extractedParameters.diffAdjustmentOffThrottle}%`
        : 'tuned diff';
    parts.push(
      dutch
        ? `Gevonden in Setup Library ("${topRef.title}"): aero ${refAero}, diff ${refDiff}.`
        : `Matched in Setup Library ("${topRef.title}"): wings ${refAero}, diff ${refDiff}.`
    );
  }
  if (learnedCount > 0) {
    parts.push(
      dutch
        ? `Inclusief ${learnedCount} eerder geleerde aanpassing(en) op dit toestel.`
        : `Backed by ${learnedCount} locally learned tuning iteration${learnedCount === 1 ? '' : 's'}.`
    );
  }

  return {
    reply: parts.join(' '),
    impacts: [
      `Aero ${params.frontWingAero}/${params.rearWingAero}`,
      `Rake +${rake}mm`,
      `Diff ${params.diffAdjustmentOnThrottle}/${params.diffAdjustmentOffThrottle}%`,
      `Bias ${params.frontBrakeBias}%`,
    ],
  };
}

export function diagnoseAndTuneWithCodedAi(input: {
  prompt: string;
  gameVersion: GameVersion;
  circuitId: string;
  weather: WeatherType;
  sessionType: SessionType;
  currentParameters: SetupParameters;
  profile: DrivingProfile;
  aiBrain?: LocalAiBrain;
  references?: ResearchResult[];
  conversationHistory?: AiChatTurn[];
}): CodedAiDiagnosis {
  const { gameVersion, currentParameters, weather, sessionType, profile } = input;
  const activeCircuit: CircuitSpec = getCircuitById(input.circuitId);
  const mentionedCircuit = findMentionedCircuit(input.prompt);
  const circuit = mentionedCircuit ?? activeCircuit;
  const references = input.references ?? [];
  const matchedRefs = searchMatchingLibraryReferences(input.prompt, circuit, references);

  const onlineKey = getOnlineKnowledgeKey(gameVersion, circuit.id, weather);
  const learnedOnline = input.aiBrain?.onlineCircuitKnowledge?.[onlineKey] ?? null;

  const specs = GAME_VERSIONS[gameVersion].parameters;
  const specName = gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Spec';
  const searchedSources = [
    `Circuit DB: ${circuit.name} (R${circuit.round})`,
    `${specName}: 21 physics bounds`,
    ...(learnedOnline
      ? [`Learned Online: ${learnedOnline.domains[0] ?? 'web'} (${learnedOnline.matchedParameterCount}p)`]
      : []),
    matchedRefs.length > 0
      ? `Setup Library: ${matchedRefs.length} match${matchedRefs.length === 1 ? '' : 'es'}`
      : `Setup Library: ${references.length} scanned`,
    `Local AI Brain: ${input.aiBrain?.learnedInteractions ?? 0} learned`,
  ];

  const dutch = isDutchText(input.prompt);
  const trimmedPrompt = input.prompt.trim();
  const directCommands = parseDirectParameterCommands(trimmedPrompt);
  const {
    matches: rawMatches,
    intensity,
    wantsQuestionOnly,
    isFollowUpEscalation,
    isPositiveFeedback,
  } = classifyPromptSymptoms(trimmedPrompt, input.conversationHistory);

  // Positive feedback acknowledgement without scrambling setup
  if (isPositiveFeedback && directCommands.length === 0 && rawMatches.length === 0) {
    return {
      intentSummary: dutch ? `Feedback ontvangen · ${circuit.name}` : `Feedback Logged · ${circuit.name}`,
      detectedSymptoms: ['Positive driver feedback'],
      searchedSources,
      confidence: 96,
      acknowledgedRequest: trimmedPrompt.slice(0, 90),
      engineerReply: dutch
        ? `Goed om te horen! Ik heb genoteerd dat deze richting goed voelt op ${circuit.name} (${weather.toUpperCase()}) en houd deze balans vast als referentie voor jouw rijstijl.`
        : `Great to hear! I've locked in that this balance works well for your style at ${circuit.name} (${weather.toUpperCase()}) so future setups keep this feel.`,
      followUpQuestion: dutch
        ? 'Wil je nu nog iets fijnslijpen, zoals rempunt of bandenslijtage?'
        : 'Want to fine-tune anything else like braking stability or tyre wear?',
      projectedImpacts: ['Balance confirmed', 'Style memory updated'],
      recommendedDiffs: [],
      nextParameters: { ...currentParameters },
      inferredTags: [],
    };
  }

  if (
    directCommands.length === 0 &&
    (wantsQuestionOnly || (rawMatches.length === 1 && rawMatches[0].id === 'explain_setup'))
  ) {
    const { reply, impacts } = buildDetailedExplanation({
      prompt: input.prompt,
      circuit: activeCircuit,
      mentionedCircuit,
      matchedRefs,
      learnedOnline,
      gameVersion,
      weather,
      params: currentParameters,
      profile,
      learnedCount: input.aiBrain?.learnedInteractions ?? 0,
    });
    return {
      intentSummary: dutch ? `Opgezocht · ${circuit.name}` : `Lookup · ${circuit.name}`,
      detectedSymptoms: ['Circuit & telemetry lookup'],
      searchedSources,
      confidence: 95,
      acknowledgedRequest: trimmedPrompt.slice(0, 90),
      engineerReply: reply,
      followUpQuestion: dutch
        ? 'Hoe voelt de auto op de baan met deze waarden? Zeg gerust wat je merkt.'
        : 'How does the car feel on track with these values? Tell me any corner issue.',
      projectedImpacts: impacts,
      recommendedDiffs: [],
      nextParameters: { ...currentParameters },
      inferredTags: [],
    };
  }

  const matches: SymptomMatch[] =
    rawMatches.length > 0
      ? rawMatches
      : directCommands.length > 0
        ? []
        : [
            {
              id: circuit.downforceDemand >= 7 ? 'more_grip' : 'faster_rotation',
              label:
                circuit.downforceDemand >= 7
                  ? 'Track-focused grip optimization'
                  : 'Track-focused pace optimization',
              score: 3.2,
            },
          ];

  const candidate: SetupParameters = { ...currentParameters };
  const reasonMap = new Map<SetupParameterKey, string[]>();
  const inferredTags = new Set<FeedbackTag>();
  const impacts = new Set<string>();

  const nudge = (key: SetupParameterKey, delta: number, reason: string) => {
    const scaled = delta * intensity;
    candidate[key] = candidate[key] + scaled;
    const list = reasonMap.get(key) ?? [];
    list.push(reason);
    reasonMap.set(key, list);
  };

  for (const m of matches) {
    switch (m.id) {
      case 'exit_oversteer':
        nudge('diffAdjustmentOnThrottle', -6, 'Reduce on-throttle locking to calm power-on rear snaps');
        nudge('rearWingAero', 2, 'Add rear aero load for corner-exit stability');
        nudge('rearAntiRollBar', -1, 'Soften rear ARB to increase rear mechanical grip on exit');
        inferredTags.add('less_oversteer');
        inferredTags.add('more_rear_stability');
        impacts.add('Exit Stability +2');
        impacts.add('Throttle Control +2');
        break;
      case 'entry_oversteer':
        nudge('frontBrakeBias', 1, 'Shift brake bias forward to settle the rear under trail braking');
        nudge('diffAdjustmentOffThrottle', 5, 'Increase off-throttle locking to damp sudden entry rotation');
        nudge('engineBraking', -10, 'Soften engine braking torque on downshifts');
        inferredTags.add('less_oversteer');
        inferredTags.add('better_braking_stability');
        impacts.add('Entry Stability +2');
        break;
      case 'mid_oversteer':
        nudge('rearWingAero', 2, 'Plant the rear axle through fast mid-corner transitions');
        nudge('rearAntiRollBar', -2, 'Allow more rear compliance mid-corner');
        nudge('rearToeIn', 0.03, 'Add subtle rear toe-in for mid-corner yaw stability');
        inferredTags.add('less_oversteer');
        impacts.add('Mid-Corner Rear Grip +2');
        break;
      case 'entry_understeer':
        nudge('frontWingAero', 2, 'Increase front wing bite for immediate turn-in response');
        nudge('diffAdjustmentOffThrottle', -5, 'Free off-throttle diff so the nose rotates on lift/brake');
        nudge('frontToeOut', 0.02, 'Add slight front toe-out to sharpen initial steering response');
        inferredTags.add('less_understeer');
        impacts.add('Turn-In Bite +2');
        break;
      case 'mid_understeer':
        nudge('frontAntiRollBar', -2, 'Soften front ARB so front tyres stay loaded through the apex');
        nudge('rearAntiRollBar', 1, 'Firm rear ARB slightly to help the car rotate mid-corner');
        nudge('frontCamber', -0.1, 'Add front camber for mid-corner lateral front grip');
        inferredTags.add('less_understeer');
        impacts.add('Apex Rotation +2');
        break;
      case 'exit_understeer':
        nudge('diffAdjustmentOnThrottle', 5, 'Slightly raise on-throttle diff to pull the nose cleanly on exit');
        nudge('frontWingAero', 1, 'Keep front axle loaded while applying throttle');
        inferredTags.add('less_understeer');
        impacts.add('Exit Rotation +1');
        break;
      case 'braking_lockup':
        nudge('brakePressure', -3, 'Lower peak brake pressure to avoid front/rear lock-ups at threshold');
        nudge('frontBrakeBias', 1, 'Stabilise braking zone attitude');
        nudge('engineBraking', -10, 'Reduce rear axle slip from harsh downshifts');
        inferredTags.add('better_braking_stability');
        impacts.add('Braking Confidence +2');
        break;
      case 'lack_top_speed':
        nudge('frontWingAero', -2, 'Trim front aero drag on long straights');
        nudge('rearWingAero', -2, 'Lower rear wing drag for stronger end-of-straight Vmax');
        nudge('rearToeIn', -0.02, 'Reduce straight-line scrub drag');
        inferredTags.add('more_top_speed');
        impacts.add('Straight Speed +2');
        impacts.add('Aero Drag -2');
        break;
      case 'lack_traction':
        nudge('diffAdjustmentOnThrottle', -6, 'Progressive diff lock prevents wheelspin out of slow corners');
        nudge('rearSuspension', -2, 'Improve rear squat and mechanical bite under acceleration');
        nudge('rearLeftTyrePressure', -0.2, 'Widen rear tyre footprint for exit traction');
        nudge('rearRightTyrePressure', -0.2, 'Widen rear tyre footprint for exit traction');
        inferredTags.add('better_traction');
        impacts.add('Exit Traction +2');
        break;
      case 'kerb_instability':
        nudge('frontRideHeight', 2, 'Raise front floor clearance so kerbs do not bottom out the plank');
        nudge('rearRideHeight', 2, 'Increase rear platform margin over aggressive chicanes');
        nudge('frontSuspension', -3, 'Soften front springs to absorb kerb strikes smoothly');
        nudge('rearSuspension', -2, 'Soften rear springs to keep tyres planted after kerb impact');
        impacts.add('Kerb Compliance +3');
        break;
      case 'tyre_overheat':
        nudge('frontCamber', 0.2, 'Reduce aggressive negative front camber to lower shoulder temperatures');
        nudge('rearCamber', 0.15, 'Ease rear lateral scrub over long runs');
        nudge('frontLeftTyrePressure', -0.2, 'Drop front-left psi slightly to widen thermal window');
        nudge('frontRightTyrePressure', -0.2, 'Drop front-right psi slightly to control peak carcass temp');
        inferredTags.add('less_tyre_wear');
        impacts.add('Tyre Longevity +2');
        break;
      case 'wet_grip':
        nudge('frontWingAero', 2, 'Add wet aero load for low-grip surface control');
        nudge('rearWingAero', 3, 'Stabilise the rear in standing water');
        nudge('diffAdjustmentOnThrottle', -6, 'Gentle power delivery prevents wet wheelspin');
        nudge('frontRideHeight', 2, 'Extra clearance prevents aquaplaning over puddles');
        nudge('rearRideHeight', 2, 'Preserve wet rear diffuser seal');
        inferredTags.add('more_rear_stability');
        impacts.add('Wet Control +3');
        break;
      case 'more_grip':
        nudge('frontWingAero', 2, 'Add balanced front aero grip through medium and high-speed corners');
        nudge('rearWingAero', 2, 'Increase rear downforce so both axles stay planted');
        nudge('frontSuspension', -2, 'Improve mechanical compliance for better cornering bite');
        nudge('rearSuspension', -2, 'Boost rear mechanical grip across apexes');
        inferredTags.add('more_cornering_grip');
        impacts.add('Cornering Grip +3');
        break;
      case 'faster_rotation':
        nudge('frontWingAero', 1, 'Sharpen front-end response at corner turn-in');
        nudge('frontAntiRollBar', -1, 'Improve front lateral compliance');
        nudge('rearAntiRollBar', 1, 'Dial in slightly quicker mid-corner rotation');
        nudge('diffAdjustmentOffThrottle', -5, 'Help the car rotate eagerly off throttle');
        inferredTags.add('better_qualifying_pace');
        impacts.add('Turn-In Agility +2');
        break;
      case 'calmer_car':
        nudge('rearWingAero', 2, 'Plant the rear end for calmer high-speed balance');
        nudge('diffAdjustmentOnThrottle', -5, 'Smooth out throttle delivery for consistent laps');
        nudge('frontBrakeBias', 1, 'Shift braking attitude forward for predictable stops');
        inferredTags.add('more_rear_stability');
        inferredTags.add('better_race_consistency');
        impacts.add('Consistency +3');
        break;
      default:
        break;
    }
  }

  // Apply explicit direct driver parameter commands last so their exact requested numbers win!
  for (const cmd of directCommands) {
    if (cmd.mode === 'set') {
      candidate[cmd.key] = cmd.value;
    } else {
      candidate[cmd.key] = candidate[cmd.key] + cmd.value;
    }
    const list = reasonMap.get(cmd.key) ?? [];
    list.push(cmd.reason);
    reasonMap.set(cmd.key, list);
    impacts.add(`Direct ${specs[cmd.key].label}`);
  }

  const nextParameters = {} as SetupParameters;
  const recommendedDiffs: AiDiagnosticDiff[] = [];

  for (const key of PARAMETER_ORDER) {
    const spec = specs[key];
    const nextVal = clampAndStep(candidate[key], spec);
    nextParameters[key] = nextVal;

    if (nextVal !== currentParameters[key]) {
      const reasons = reasonMap.get(key) ?? ['Adjusted by RS Coded AI'];
      recommendedDiffs.push({
        key,
        label: spec.label,
        previous: currentParameters[key],
        next: nextVal,
        formattedPrevious: formatParamValue(currentParameters[key], spec),
        formattedNext: formatParamValue(nextVal, spec),
        reason: Array.from(new Set(reasons)).join('; '),
      });
    }
  }

  const topScore = matches[0]?.score ?? 3.5;
  const confidence = Math.round(
    Math.min(98, Math.max(78, 76 + topScore * 4 + (recommendedDiffs.length > 0 ? 4 : 0)))
  );
  const symptomNames =
    directCommands.length > 0 && matches.length === 0
      ? ['Direct driver adjustment']
      : matches.map((m) => m.label);

  const summaryDiffText = recommendedDiffs
    .slice(0, 3)
    .map((d) => `${d.label} (${d.formattedPrevious} → ${d.formattedNext})`)
    .join(', ');

  const escalationLeadNl = isFollowUpEscalation
    ? 'Ik luister naar je feedback — omdat je klacht nog aanwezig was, zet ik nu een duidelijkere stap. '
    : `Ik hoor je over "${trimmedPrompt.slice(0, 68)}${trimmedPrompt.length > 68 ? '…' : ''}". `;
  const escalationLeadEn = isFollowUpEscalation
    ? 'Hear you loud and clear — since the issue is still there, I am making a stronger adjustment now. '
    : `Got your note ("${trimmedPrompt.slice(0, 68)}${trimmedPrompt.length > 68 ? '…' : ''}"). `;

  const learnedNoteNl =
    learnedOnline && learnedOnline.matchedParameterCount > 0
      ? ` Getoetst aan lokale online kennis (${learnedOnline.domains[0] ?? 'web'}).`
      : '';
  const learnedNoteEn =
    learnedOnline && learnedOnline.matchedParameterCount > 0
      ? ` Cross-checked with locally learned online data (${learnedOnline.domains[0] ?? 'web'}).`
      : '';

  const engineerReply =
    recommendedDiffs.length > 0
      ? dutch
        ? `${escalationLeadNl}Voor ${circuit.name} (${sessionType.replace('_', ' ')}) focus ik op ${symptomNames.join(' + ').toLowerCase()}: ${summaryDiffText}.${learnedNoteNl}`
        : `${escalationLeadEn}For ${circuit.name} (${sessionType.replace('_', ' ')}), targeting ${symptomNames.join(' + ').toLowerCase()}: ${summaryDiffText}.${learnedNoteEn}`
      : dutch
        ? `Ik hoor je verzoek voor ${circuit.name}, maar de gevraagde waarden staan al exact op de veilige ${specName}-grens.`
        : `Got your request for ${circuit.name} — those parameters are already right at the safe ${specName} limit.`;

  const followUpQuestion =
    recommendedDiffs.length > 0
      ? dutch
        ? 'Pas dit gerust toe en laat weten hoe de auto reageert — dan leer ik mee.'
        : 'Apply these changes and let me know how the car reacts so I can learn from your feedback.'
      : undefined;

  return {
    intentSummary:
      directCommands.length > 0 && matches.length === 0
        ? dutch
          ? `Directe aanpassing · ${circuit.name}`
          : `Direct Tune · ${circuit.name}`
        : symptomNames[0] ?? 'Custom AI Tune',
    detectedSymptoms: symptomNames,
    searchedSources,
    confidence,
    acknowledgedRequest: trimmedPrompt.slice(0, 90),
    engineerReply,
    followUpQuestion,
    projectedImpacts: Array.from(impacts).slice(0, 4),
    recommendedDiffs,
    nextParameters,
    inferredTags: Array.from(inferredTags),
  };
}
