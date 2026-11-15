import type {
  CircuitSpec,
  DrivingProfile,
  FeedbackTag,
  GameVersion,
  SessionType,
  SetupParameters,
  SetupParameterKey,
  WeatherType,
} from '../types/setup';
import { GAME_VERSIONS, PARAMETER_ORDER, clampAndStep, formatParamValue } from './specs';
import { getCircuitById } from './generator';

export interface LocalAiBrain {
  version: 1;
  learnedInteractions: number;
  globalStyleShifts: Partial<Record<SetupParameterKey, number>>;
  trackBiases: Record<string, Partial<Record<SetupParameterKey, number>>>;
  recentInsights: string[];
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

export interface CodedAiDiagnosis {
  intentSummary: string;
  detectedSymptoms: string[];
  confidence: number;
  engineerReply: string;
  projectedImpacts: string[];
  recommendedDiffs: AiDiagnosticDiff[];
  nextParameters: SetupParameters;
  inferredTags: FeedbackTag[];
}

export const AI_QUICK_PROMPTS: Array<{ id: string; label: string; prompt: string }> = [
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
    id: 'braking_lock',
    label: 'Braking lock-up',
    prompt: 'Wheels lock up and car feels unstable under heavy braking',
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
    id: 'tyre_wear',
    label: 'High tyre wear',
    prompt: 'Tyres overheat and wear too quickly over a race stint',
  },
];

export function createInitialAiBrain(): LocalAiBrain {
  return {
    version: 1,
    learnedInteractions: 0,
    globalStyleShifts: {},
    trackBiases: {},
    recentInsights: [],
    updatedAt: new Date().toISOString(),
  };
}

export function getTrackBiasKey(gameVersion: GameVersion, circuitId: string): string {
  return `${gameVersion}:${circuitId}`;
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
    // Track weight absorbs 65% of the proven adjustment, global driving style absorbs 20%
    nextTrack[key] = clampBias(key, (nextTrack[key] ?? 0) * 0.9 + delta * 0.65);
    nextGlobal[key] = clampBias(key, (nextGlobal[key] ?? 0) * 0.92 + delta * 0.2);
  }

  const insights = params.insightSummary.trim()
    ? [params.insightSummary.trim(), ...brain.recentInsights].slice(0, 12)
    : brain.recentInsights;

  return {
    version: 1,
    learnedInteractions: brain.learnedInteractions + 1,
    globalStyleShifts: nextGlobal,
    trackBiases: {
      ...brain.trackBiases,
      [trackKey]: nextTrack,
    },
    recentInsights: insights,
    updatedAt: new Date().toISOString(),
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
      ['explain', 3],
      ['why', 2.5],
      ['waarom', 2.5],
      ['uitleg', 3],
      ['leg uit', 3],
      ['overview', 2],
      ['breakdown', 2.5],
    ],
  },
  {
    id: 'exit_oversteer',
    label: 'Exit oversteer / throttle snap',
    keywords: [
      ['snap', 3],
      ['oversteer', 2],
      ['overstuur', 2],
      ['spin', 2.5],
      ['uitbreekt', 3],
      ['breekt uit', 3],
      ['loose rear', 2.5],
      ['rear steps out', 3],
      ['achterkant', 1.8],
      ['throttle', 1.5],
      ['gas', 1.5],
      ['exit', 1.5],
    ],
  },
  {
    id: 'entry_oversteer',
    label: 'Entry instability / turn-in oversteer',
    keywords: [
      ['entry oversteer', 3.5],
      ['turn-in snap', 3.5],
      ['insturen overstuur', 3.5],
      ['loose on entry', 3],
      ['trail braking', 2.5],
      ['downshift', 2],
      ['entry', 1.4],
      ['insturen', 1.4],
    ],
  },
  {
    id: 'mid_oversteer',
    label: 'Mid-corner rear slip',
    keywords: [
      ['mid corner oversteer', 3.5],
      ['mid-corner oversteer', 3.5],
      ['apex snap', 3],
      ['high speed corner', 2.2],
      ['snelle bocht', 2.2],
    ],
  },
  {
    id: 'entry_understeer',
    label: 'Entry understeer / sluggish turn-in',
    keywords: [
      ['understeer', 2.2],
      ['onderstuur', 2.2],
      ['wash wide', 3],
      ['pushes wide', 3],
      ['wijd', 2],
      ['no turn in', 3],
      ['turn-in', 2],
      ['stuurt niet', 3],
      ['entry', 1.3],
      ['insturen', 1.3],
    ],
  },
  {
    id: 'mid_understeer',
    label: 'Mid-corner understeer',
    keywords: [
      ['mid corner understeer', 3.5],
      ['mid-corner understeer', 3.5],
      ['missed apex', 2.5],
      ['front washes', 2.5],
      ['apex', 1.4],
    ],
  },
  {
    id: 'exit_understeer',
    label: 'Exit understeer / power push',
    keywords: [
      ['exit understeer', 3.5],
      ['on power understeer', 3.5],
      ['uitkomen onderstuur', 3.5],
      ['push on exit', 3],
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
      ['brake', 2],
      ['braking', 2.2],
      ['remmen', 2.5],
      ['rem', 2],
    ],
  },
  {
    id: 'lack_top_speed',
    label: 'Straight-line top speed deficit',
    keywords: [
      ['top speed', 3.5],
      ['topsnelheid', 3.5],
      ['straight', 2.2],
      ['rechte stuk', 3],
      ['drag', 2.5],
      ['slow on straight', 3.5],
      ['drs', 2],
      ['sneller op recht', 3],
    ],
  },
  {
    id: 'lack_traction',
    label: 'Corner-exit traction loss',
    keywords: [
      ['traction', 3],
      ['tractie', 3],
      ['wheelspin', 3.2],
      ['spinnen', 2.5],
      ['no grip on exit', 3],
      ['acceleration', 2],
      ['uitaccelereren', 3],
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
      ['bounce', 3],
      ['stuitert', 3.5],
      ['bump', 2.5],
      ['hobbels', 3],
      ['bottoming', 3],
      ['bodem', 2.5],
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
      ['banden', 2.5],
      ['overheat', 3.5],
      ['heet', 2.5],
      ['warm', 2],
      ['wear', 3],
      ['slijt', 3.5],
      ['slijtage', 3.5],
      ['stint', 1.8],
      ['deg', 2.5],
    ],
  },
  {
    id: 'wet_grip',
    label: 'Wet weather confidence & standing water',
    keywords: [
      ['wet', 3],
      ['rain', 3.2],
      ['regen', 3.2],
      ['nat', 3],
      ['inters', 2.5],
      ['intermediate', 2.5],
      ['aquaplane', 3.5],
    ],
  },
];

function classifyPromptSymptoms(rawPrompt: string): {
  matches: SymptomMatch[];
  intensity: number;
} {
  const text = rawPrompt.toLowerCase().trim();
  if (!text) {
    return { matches: [{ id: 'explain_setup', label: 'Setup explanation', score: 1 }], intensity: 1 };
  }

  let intensity = 1.0;
  if (/(slight|a bit|little|mild|beetje|licht|klein)/.test(text)) {
    intensity = 0.7;
  } else if (/(massive|huge|very|terrible|lot|heavy|erg|veel|enorm|zwaar|constant)/.test(text)) {
    intensity = 1.45;
  }

  const hasEntry = /(entry|turn in|turn-in|insturen|remzone)/.test(text);
  const hasExit = /(exit|throttle|power|uitkomen|gas)/.test(text);
  const hasMid = /(mid|apex|midden)/.test(text);

  const scored: SymptomMatch[] = [];
  for (const pat of SYMPTOM_PATTERNS) {
    let score = 0;
    for (const [kw, w] of pat.keywords) {
      if (text.includes(kw)) score += w;
    }
    // Phase disambiguation bonuses
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

  scored.sort((a, b) => b.score - a.score);
  return { matches: scored.slice(0, 3), intensity };
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
}): CodedAiDiagnosis {
  const { gameVersion, currentParameters, weather, sessionType, profile } = input;
  const circuit: CircuitSpec = getCircuitById(input.circuitId);
  const specs = GAME_VERSIONS[gameVersion].parameters;
  const { matches, intensity } = classifyPromptSymptoms(input.prompt);

  const isExplainOnly =
    matches.length === 0 || (matches.length === 1 && matches[0].id === 'explain_setup');

  if (isExplainOnly) {
    const avgWing = Math.round((currentParameters.frontWingAero + currentParameters.rearWingAero) / 2);
    const rake = currentParameters.rearRideHeight - currentParameters.frontRideHeight;
    const learnedCount = input.aiBrain?.learnedInteractions ?? 0;
    return {
      intentSummary: 'Telemetry & Setup Breakdown',
      detectedSymptoms: ['Setup inspection'],
      confidence: 94,
      engineerReply:
        `${circuit.name} (${gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Spec'}, ${weather.toUpperCase()}) runs ${currentParameters.frontWingAero}/${currentParameters.rearWingAero} wings (avg ${avgWing}) with ${rake}mm rake and ${currentParameters.diffAdjustmentOnThrottle}% on-throttle diff. ` +
        `This balances ${circuit.downforceDemand}/10 cornering load against ${circuit.topSpeedPriority}/10 straight-line priority for your ${profile.rearStability}/10 stability target.` +
        (learnedCount > 0 ? ` Backed by ${learnedCount} locally learned tuning iterations.` : ''),
      projectedImpacts: [
        `Aero avg ${avgWing}`,
        `Rake +${rake}mm`,
        `Brake bias ${currentParameters.frontBrakeBias}%`,
      ],
      recommendedDiffs: [],
      nextParameters: { ...currentParameters },
      inferredTags: [],
    };
  }

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
      default:
        break;
    }
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

  const topScore = matches[0]?.score ?? 3;
  const confidence = Math.round(Math.min(96, Math.max(70, 72 + topScore * 4 + (recommendedDiffs.length > 0 ? 4 : 0))));
  const symptomNames = matches.map((m) => m.label);

  const engineerReply =
    recommendedDiffs.length > 0
      ? `Diagnosed ${symptomNames.join(' + ').toLowerCase()} at ${circuit.name} (${sessionType.replace('_', ' ')}). ` +
        `Our coded physics model computed ${recommendedDiffs.length} bounded ${gameVersion === 'f1_25_2026_pack' ? '2026 Pack' : '2025 Spec'} adjustment${recommendedDiffs.length === 1 ? '' : 's'} ` +
        `while preserving your remaining baseline parameters.`
      : `Your current ${circuit.name} values already sit at the safe regulation boundary for ${symptomNames.join(' & ').toLowerCase()}.`;

  return {
    intentSummary: symptomNames[0] ?? 'Custom AI Tune',
    detectedSymptoms: symptomNames,
    confidence,
    engineerReply,
    projectedImpacts: Array.from(impacts).slice(0, 4),
    recommendedDiffs,
    nextParameters,
    inferredTags: Array.from(inferredTags),
  };
}
