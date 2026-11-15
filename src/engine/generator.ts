import type {
  CircuitSpec,
  DrivingProfile,
  FeedbackTag,
  GameVersion,
  ResearchResult,
  SessionType,
  SetupAdjustmentNote,
  SetupAnalysis,
  SetupParameters,
  SetupParameterKey,
  SetupSourceReference,
  SetupVersionRecord,
  WeatherType,
} from '../types/setup';
import {
  CIRCUITS,
  GAME_VERSIONS,
  PARAMETER_ORDER,
  clampAndStep,
  formatParamValue,
} from './specs';
import { getTrackBiasKey, type LocalAiBrain } from './setupAi';

export interface GenerateSetupInput {
  gameVersion: GameVersion;
  circuitId: string;
  weather: WeatherType;
  sessionType: SessionType;
  profile: DrivingProfile;
  raceTyreFocus?: boolean;
  raceConsistencyFocus?: boolean;
  researchEntries?: ResearchResult[];
  recentCircuitFeedback?: FeedbackTag[];
  circuitNote?: string;
  aiBrain?: LocalAiBrain;
}

export interface GeneratedSetupOutput {
  title: string;
  circuit: CircuitSpec;
  parameters: SetupParameters;
  analysis: SetupAnalysis;
}

function normalizeAllParameters(
  raw: SetupParameters,
  gameVersion: GameVersion
): SetupParameters {
  const specs = GAME_VERSIONS[gameVersion].parameters;
  const out = {} as SetupParameters;
  for (const key of PARAMETER_ORDER) {
    out[key] = clampAndStep(raw[key], specs[key]);
  }
  return out;
}

export function getCircuitById(circuitId: string): CircuitSpec {
  return CIRCUITS.find((c) => c.id === circuitId) ?? CIRCUITS[11]; // Default Silverstone if unknown
}

/**
 * Deterministic motorsport setup engine.
 * Computes base aerodynamic, transmission, geometry, suspension, brake, and tyre targets
 * strictly from track physics, weather, session goals, game version chassis rules,
 * personal driving profile, and any matching verified research data.
 */
export function generateSetup(input: GenerateSetupInput): GeneratedSetupOutput {
  const circuit = getCircuitById(input.circuitId);
  const { gameVersion, weather, sessionType, profile } = input;
  const is2026 = gameVersion === 'f1_25_2026_pack';
  const isWet = weather === 'wet';

  // 1. Aerodynamics — track downforce demand + speed/grip preference + weather + 2026 active-aero trim
  const baseAero = 11 + circuit.downforceDemand * 3.4; // ranges ~18 (Monza) to ~45 (Monaco)
  const profileAeroDelta = (profile.speedVsGrip - 5.5) * 1.4;
  const wetAeroBonus = isWet ? 7 + (10 - profile.wetConfidence) * 0.45 : 0;
  const sessionAeroDelta =
    sessionType === 'time_trial' ? -1.0 : sessionType === 'race' ? 1.0 : 0;
  const versionAeroDelta = is2026 ? -3.0 : 0; // 2026 Season Pack lower baseline drag profile

  // Wing split determines aero balance (front vs rear): positive gap = sharper front or safer rear
  let wingSplit = 0; // front - rear
  if (circuit.dominantLimitation === 'front_limited') wingSplit += 2;
  if (circuit.dominantLimitation === 'rear_traction') wingSplit -= 2;
  wingSplit -= (profile.rearStability - 5.5) * 0.7;
  wingSplit += (profile.carAggression - 5.5) * 0.5;
  if (profile.understeerTendency >= 6) wingSplit += 1.5;
  if (profile.oversteerTendency >= 6) wingSplit -= 1.8;
  if (isWet) wingSplit -= 2.5;

  const rearWingRaw = baseAero + profileAeroDelta + wetAeroBonus + sessionAeroDelta + versionAeroDelta;
  const frontWingRaw = rearWingRaw + wingSplit;

  // 2. Transmission — traction, rotation, braking stability
  let onThrottle = 55 + (profile.rearStability - 5) * 2.5 - (profile.carAggression - 5) * 1.5;
  if (circuit.tractionDemand >= 8) onThrottle -= 5; // allow smoother throttle release without snap? Actually lower on-throttle diff helps stability on exit in F1 25
  if (profile.oversteerTendency >= 6 && profile.oversteerPhase === 'exit') onThrottle -= 10;
  if (profile.understeerTendency >= 6 && profile.understeerPhase === 'exit') onThrottle += 5;
  if (sessionType === 'race' && input.raceTyreFocus) onThrottle -= 5;
  if (isWet) onThrottle -= 15;

  let offThrottle = 45 + (profile.rearStability - 5) * 2.0 - (profile.carAggression - 5) * 2.0;
  if (profile.understeerTendency >= 6 && profile.understeerPhase === 'entry') offThrottle -= 10;
  if (profile.oversteerTendency >= 6 && profile.oversteerPhase === 'entry') offThrottle += 10;
  if (isWet) offThrottle += 10;

  let engineBraking = 50 + (profile.carAggression - 5) * 3;
  if (circuit.brakingDemand >= 8) engineBraking += 10;
  if (profile.oversteerPhase === 'entry') engineBraking -= 10;
  if (isWet) engineBraking -= 10;

  // 3. Suspension Geometry — camber & toe trade-off between mid-corner grip, drag & tyre wear
  const tyreConserving =
    profile.tyreWearPriority >= 7 || (sessionType === 'race' && Boolean(input.raceTyreFocus));
  let frontCamber = -3.3 + (tyreConserving ? 0.3 : 0) + (isWet ? 0.3 : 0);
  let rearCamber = -1.8 + (tyreConserving ? 0.25 : 0) + (isWet ? 0.25 : 0);
  if (circuit.tyreStress >= 9 && sessionType === 'race') {
    frontCamber += 0.2;
    rearCamber += 0.15;
  }

  let frontToeOut =
    0.04 +
    (profile.carAggression - 5) * 0.01 +
    (profile.understeerTendency >= 6 ? 0.03 : 0) -
    (tyreConserving ? 0.02 : 0);
  let rearToeIn =
    0.10 +
    (profile.rearStability - 5) * 0.02 +
    (profile.oversteerTendency >= 6 ? 0.04 : 0) +
    (isWet ? 0.05 : 0) -
    (circuit.topSpeedPriority >= 9 ? 0.04 : 0);

  // 4. Suspension & Anti-Roll Bars & Ride Height
  let frontSusp = 28 + (circuit.downforceDemand - 5) * 1.6 - (circuit.kerbSeverity - 5) * 1.4;
  let rearSusp = 14 + (profile.carAggression - 5) * 1.1 - (profile.rearStability - 5) * 1.2;
  if (is2026) {
    // 2026 cars are slightly lighter with narrower aero sensitivity -> modestly more compliant suspension
    frontSusp -= 2;
    rearSusp -= 1;
  }
  if (isWet) {
    frontSusp -= 5;
    rearSusp -= 4;
  }

  let frontARB = 12 + (profile.carAggression - 5) * 0.6 - (circuit.kerbSeverity - 5) * 0.6;
  let rearARB = 7 + (profile.carAggression - 5) * 0.8 - (profile.rearStability - 5) * 0.9;
  if (profile.understeerTendency >= 6 && profile.understeerPhase === 'mid') {
    frontARB -= 2;
    rearARB += 2;
  }
  if (profile.oversteerTendency >= 6 && profile.oversteerPhase === 'mid') {
    frontARB += 2;
    rearARB -= 2;
  }
  if (isWet) {
    frontARB -= 3;
    rearARB -= 3;
  }

  let frontRideHeight = 20 + Math.round((circuit.kerbSeverity - 4) * 1.1) + (isWet ? 5 : 0);
  let rearRideHeight = 46 + Math.round((circuit.kerbSeverity - 4) * 1.2) + (isWet ? 6 : 0);
  if (profile.rearStability >= 8) rearRideHeight -= 2; // lower rear rake stabilizes fast entries
  if (is2026) {
    frontRideHeight += 1;
    rearRideHeight -= 1;
  }

  // 5. Brakes
  let brakePressure = 95 + Math.round((profile.limitConfidence - 5) * 1.0) - (isWet ? 6 : 0);
  if (sessionType === 'race' && input.raceConsistencyFocus) brakePressure -= 2;

  let frontBrakeBias = 55 + Math.round((profile.rearStability - 5) * 0.6);
  if (profile.oversteerPhase === 'entry') frontBrakeBias += 2;
  if (profile.understeerPhase === 'entry') frontBrakeBias -= 1;
  if (isWet) frontBrakeBias += 1;

  // 6. Tyre Pressures — manage thermal carcass load vs traction
  const baseFrontPsi =
    23.4 + (circuit.tyreStress >= 8 ? 0.8 : 0) + (sessionType === 'race' ? 0.4 : 0) + (isWet ? 0.5 : 0);
  const baseRearPsi =
    21.2 + (circuit.tractionDemand >= 8 ? -0.3 : 0.4) + (sessionType === 'race' ? 0.3 : 0) + (isWet ? 0.4 : 0);

  // Subtle side-bias for high-stress asymmetrical tracks (front-left loaded clockwise tracks)
  const frontLeftOffset = circuit.tyreStress >= 8 ? 0.2 : 0;

  let candidate: SetupParameters = {
    frontWingAero: frontWingRaw,
    rearWingAero: rearWingRaw,
    diffAdjustmentOnThrottle: onThrottle,
    diffAdjustmentOffThrottle: offThrottle,
    engineBraking,
    frontCamber,
    rearCamber,
    frontToeOut,
    rearToeIn,
    frontSuspension: frontSusp,
    rearSuspension: rearSusp,
    frontAntiRollBar: frontARB,
    rearAntiRollBar: rearARB,
    frontRideHeight,
    rearRideHeight,
    brakePressure,
    frontBrakeBias,
    frontRightTyrePressure: baseFrontPsi,
    frontLeftTyrePressure: baseFrontPsi + frontLeftOffset,
    rearRightTyrePressure: baseRearPsi,
    rearLeftTyrePressure: baseRearPsi,
  };

  // Apply remembered circuit-specific feedback tendencies from previous stints at this track
  const rememberedTags = input.recentCircuitFeedback ?? [];
  if (rememberedTags.includes('less_oversteer') || rememberedTags.includes('more_rear_stability')) {
    candidate.rearWingAero += 1;
    candidate.diffAdjustmentOnThrottle -= 5;
  }
  if (rememberedTags.includes('less_understeer')) {
    candidate.frontWingAero += 1;
    candidate.frontAntiRollBar -= 1;
  }
  if (rememberedTags.includes('more_top_speed')) {
    candidate.frontWingAero -= 1;
    candidate.rearWingAero -= 1;
  }
  if (rememberedTags.includes('better_traction')) {
    candidate.diffAdjustmentOnThrottle -= 5;
    candidate.rearRightTyrePressure -= 0.1;
    candidate.rearLeftTyrePressure -= 0.1;
  }
  if (rememberedTags.includes('better_braking_stability')) {
    candidate.frontBrakeBias += 1;
    candidate.brakePressure -= 1;
  }
  if (rememberedTags.includes('less_tyre_wear')) {
    candidate.frontCamber += 0.1;
    candidate.rearCamber += 0.1;
  }

  // Blend in verified external/local library entries if matching version/circuit/weather exist (max 22% influence, never blind copy)
  const matchingResearch = (input.researchEntries ?? []).filter(
    (r) =>
      r.gameVersion === gameVersion &&
      r.weather === weather &&
      (r.circuitId === circuit.id || r.circuitName.toLowerCase() === circuit.name.toLowerCase()) &&
      Object.keys(r.extractedParameters).length > 0
  );

  if (matchingResearch.length > 0) {
    for (const key of PARAMETER_ORDER) {
      const externalVals = matchingResearch
        .map((m) => m.extractedParameters[key])
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      if (externalVals.length > 0) {
        const avgExternal = externalVals.reduce((a, b) => a + b, 0) / externalVals.length;
        candidate[key] = candidate[key] * 0.78 + avgExternal * 0.22;
      }
    }
  }

  // Apply self-coded LocalAiBrain learned parameter weights (global style + isolated per-track bias)
  let aiWeightAppliedCount = 0;
  if (input.aiBrain) {
    const trackKey = getTrackBiasKey(gameVersion, circuit.id);
    const trackBias = input.aiBrain.trackBiases[trackKey] ?? {};
    const globalBias = input.aiBrain.globalStyleShifts ?? {};
    for (const key of PARAMETER_ORDER) {
      const tb = trackBias[key] ?? 0;
      const gb = globalBias[key] ?? 0;
      const combinedShift = tb + gb * 0.5;
      if (Math.abs(combinedShift) > 0.001) {
        candidate[key] += combinedShift;
        aiWeightAppliedCount += 1;
      }
    }
  }

  const parameters = normalizeAllParameters(candidate, gameVersion);
  const analysis = buildSetupAnalysis(
    parameters,
    input,
    circuit,
    matchingResearch,
    aiWeightAppliedCount
  );

  const versionTag = gameVersion === 'f1_25_2025' ? '2025 Spec' : '2026 Pack';
  const sessionLabel =
    sessionType === 'time_trial'
      ? 'Time Trial'
      : sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
  const weatherLabel = weather === 'wet' ? 'Wet' : 'Dry';

  return {
    title: `${circuit.name} · ${versionTag} ${sessionLabel} (${weatherLabel})`,
    circuit,
    parameters,
    analysis,
  };
}

export function computeCompatibilityScore(
  params: SetupParameters,
  profile: DrivingProfile,
  circuit: CircuitSpec,
  weather: WeatherType,
  sessionType: SessionType
): number {
  let score = 88;

  // Aero alignment with user speed vs grip preference
  const avgWing = (params.frontWingAero + params.rearWingAero) / 2;
  const idealWingForPref = 14 + circuit.downforceDemand * 2.8 + (profile.speedVsGrip - 5) * 1.4 + (weather === 'wet' ? 6 : 0);
  const aeroDelta = Math.abs(avgWing - idealWingForPref);
  score -= Math.min(18, aeroDelta * 0.85);

  // Rear stability check
  const wingBias = params.rearWingAero - params.frontWingAero;
  if (profile.rearStability >= 7 && wingBias < 0) score -= 5;
  if (profile.carAggression >= 8 && wingBias > 5) score -= 4;

  // Tyre wear alignment in race
  if (sessionType === 'race' && profile.tyreWearPriority >= 7 && params.frontCamber < -3.3) {
    score -= 4;
  }

  // Braking confidence alignment
  if (profile.limitConfidence <= 4 && params.brakePressure >= 99) {
    score -= 4;
  }

  return Math.round(Math.max(52, Math.min(98, score)));
}

function buildSetupAnalysis(
  params: SetupParameters,
  input: GenerateSetupInput,
  circuit: CircuitSpec,
  matchingResearch: ResearchResult[],
  aiWeightAppliedCount = 0
): SetupAnalysis {
  const { gameVersion, weather, sessionType, profile } = input;
  const compatibilityScore = computeCompatibilityScore(params, profile, circuit, weather, sessionType);
  const is2026 = gameVersion === 'f1_25_2026_pack';

  const explanations: SetupAdjustmentNote[] = [
    {
      section: 'Aerodynamics',
      parameterLabels: `Front ${params.frontWingAero} / Rear ${params.rearWingAero}`,
      reasoning: `Calibrated for ${circuit.name}'s ${circuit.downforceDemand}/10 downforce demand and your ${profile.speedVsGrip}/10 cornering-vs-top-speed preference${weather === 'wet' ? ', with extra wet wing load for standing water traction' : ''}.`,
    },
    {
      section: 'Transmission',
      parameterLabels: `On-Throttle ${params.diffAdjustmentOnThrottle}% / Off-Throttle ${params.diffAdjustmentOffThrottle}% / Engine Braking ${params.engineBraking}%`,
      reasoning:
        profile.oversteerPhase === 'exit'
          ? `On-throttle differential is moderated at ${params.diffAdjustmentOnThrottle}% to prevent wheelspin snaps on corner exit.`
          : `Balanced locking targets clean ${circuit.dominantLimitation.replace('_', ' ')} control while preserving apex rotation.`,
    },
    {
      section: 'Suspension Geometry',
      parameterLabels: `Camber ${params.frontCamber.toFixed(2)}° / ${params.rearCamber.toFixed(2)}° · Toe ${params.frontToeOut.toFixed(2)}° / ${params.rearToeIn.toFixed(2)}°`,
      reasoning:
        profile.tyreWearPriority >= 7 || input.raceTyreFocus
          ? 'Moderated negative camber and toe angles reduce shoulder scrubbing across longer stints.'
          : 'Aggressive camber and toe geometry sharpen lateral grip and turn-in bite.',
    },
    {
      section: 'Suspension',
      parameterLabels: `Susp ${params.frontSuspension}/${params.rearSuspension} · ARB ${params.frontAntiRollBar}/${params.rearAntiRollBar} · Ride ${params.frontRideHeight}/${params.rearRideHeight}`,
      reasoning: `Tuned for ${circuit.kerbSeverity}/10 kerb severity (${circuit.engineeringNotes.toLowerCase().slice(0, -1)}).`,
    },
    {
      section: 'Brakes',
      parameterLabels: `Pressure ${params.brakePressure}% · Front Bias ${params.frontBrakeBias}%`,
      reasoning: `Brake pressure matches your ${profile.limitConfidence}/10 limit confidence${profile.oversteerPhase === 'entry' ? ' with forward bias shift to calm entry instability' : ''}.`,
    },
    {
      section: 'Tyres',
      parameterLabels: `Front ${params.frontLeftTyrePressure.toFixed(1)}/${params.frontRightTyrePressure.toFixed(1)} psi · Rear ${params.rearLeftTyrePressure.toFixed(1)}/${params.rearRightTyrePressure.toFixed(1)} psi`,
      reasoning: `Pressures control core temperature build-up under ${circuit.tyreStress}/10 lateral carcass load.`,
    },
  ];

  const advantages: string[] = [];
  const disadvantages: string[] = [];

  if (params.rearWingAero >= params.frontWingAero) {
    advantages.push('Predictable high-speed rear platform through fast direction changes and braking.');
  } else {
    advantages.push('Strong front-end rotation and immediate apex turn-in response.');
  }

  if (params.diffAdjustmentOnThrottle <= 55) {
    advantages.push('Smooth progressive throttle application out of low-gear traction zones.');
  } else {
    advantages.push('Strong forward drive when accelerating straight out of medium-speed exits.');
  }

  if (profile.tyreWearPriority >= 7 || input.raceTyreFocus) {
    advantages.push('Controlled tyre thermal degradation over full race stints.');
    disadvantages.push('Slightly less peak single-lap lateral bite compared to an aggressive time-trial trim.');
  } else {
    advantages.push('High responsiveness for qualifying or short-stint attack laps.');
    disadvantages.push('Higher thermal load may require careful management late in a stint.');
  }

  if (params.frontWingAero + params.rearWingAero > 64) {
    disadvantages.push('Higher drag may leave you slightly exposed at the end of long DRS straights.');
  } else if (params.frontWingAero + params.rearWingAero < 36) {
    disadvantages.push('Lower wing levels demand smooth steering inputs in medium-speed corners.');
  }

  if (is2026) {
    disadvantages.push(
      '2026 Season Pack baseline: verify floor ride-height margin after your first flying lap on this track.'
    );
  }

  if (input.recentCircuitFeedback && input.recentCircuitFeedback.length > 0) {
    advantages.unshift(
      `Adapted from your remembered ${circuit.name} session feedback (${input.recentCircuitFeedback.slice(0, 3).map((t) => t.replace(/_/g, ' ')).join(', ')}).`
    );
  }

  if (aiWeightAppliedCount > 0 && input.aiBrain) {
    advantages.unshift(
      `Tuned by RS Coded AI using ${input.aiBrain.learnedInteractions} learned session${input.aiBrain.learnedInteractions === 1 ? '' : 's'} (${aiWeightAppliedCount} track/style parameter weights active).`
    );
  }

  if (input.circuitNote && input.circuitNote.trim().length > 0) {
    advantages.push(`Personal track note applied: "${input.circuitNote.trim().slice(0, 120)}"`);
  }

  const sources: SetupSourceReference[] =
    matchingResearch.length > 0
      ? matchingResearch.map((r) => ({
          title: r.title,
          url: r.sourceUrl,
          sourceType: r.sourceName,
          collectedAt: r.collectedAt,
          note: r.summary,
        }))
      : [
          {
            title: `RS Coded Setup AI (${is2026 ? '2026 Season Pack' : '2025 Cars'})`,
            url: 'local://rs-setups/coded-ai-engine',
            sourceType: '100% Custom-Coded TypeScript Physics & Adaptive Memory',
            collectedAt: new Date().toISOString(),
            note: 'Calculated 100% locally in custom TypeScript code from EA Sports F1 25 track demands, your driving profile, and your persistent on-device AI weights.',
          },
        ];

  return {
    compatibilityScore,
    suitabilitySummary: `Engineered for a ${compatibilityScore}% personal fit with your driving profile at ${circuit.name}.`,
    suitabilityDistinction:
      'Personal Suitability vs. Objective Pace: This setup prioritizes your personal control, braking confidence, and stability profile rather than chasing fragile esports-only time-trial extremes. No specific lap time is guaranteed.',
    explanations,
    advantages,
    disadvantages,
    sources,
  };
}

export interface FeedbackApplicationResult {
  nextParameters: SetupParameters;
  nextAnalysis: SetupAnalysis;
  nextProfile: DrivingProfile;
  diffSummary: SetupVersionRecord['diffSummary'];
  appliedSummary: string;
}

/**
 * Applies targeted incremental driver feedback without scrambling unrelated parameters.
 */
export function applyFeedbackToSetup(params: {
  gameVersion: GameVersion;
  circuitId: string;
  weather: WeatherType;
  sessionType: SessionType;
  currentParameters: SetupParameters;
  profile: DrivingProfile;
  feedbackTags: FeedbackTag[];
  feedbackNotes: string;
  researchEntries?: ResearchResult[];
}): FeedbackApplicationResult {
  const { gameVersion, currentParameters, profile, feedbackTags } = params;
  const specs = GAME_VERSIONS[gameVersion].parameters;
  const circuit = getCircuitById(params.circuitId);

  const nextRaw: SetupParameters = { ...currentParameters };
  const nextProfile: DrivingProfile = { ...profile };
  const reasonMap = new Map<SetupParameterKey, string[]>();

  const adjust = (key: SetupParameterKey, delta: number, reason: string) => {
    nextRaw[key] = nextRaw[key] + delta;
    const list = reasonMap.get(key) ?? [];
    list.push(reason);
    reasonMap.set(key, list);
  };

  for (const tag of feedbackTags) {
    switch (tag) {
      case 'more_top_speed':
        adjust('rearWingAero', -2, 'Lower rear wing drag for higher straight-line speed');
        adjust('frontWingAero', -2, 'Maintain aero balance while trimming front drag');
        nextProfile.speedVsGrip = Math.max(1, nextProfile.speedVsGrip - 1);
        break;
      case 'more_cornering_grip':
        adjust('frontWingAero', 2, 'Increase front aerodynamic load for apex grip');
        adjust('rearWingAero', 2, 'Increase rear aerodynamic load through fast corners');
        nextProfile.speedVsGrip = Math.min(10, nextProfile.speedVsGrip + 1);
        break;
      case 'less_understeer':
        adjust('frontWingAero', 2, 'Add front downforce for stronger turn-in bite');
        adjust('frontAntiRollBar', -1, 'Soften front ARB to help front tyres grip mid-corner');
        adjust('diffAdjustmentOffThrottle', -5, 'Unlock off-throttle diff for sharper rotation on entry');
        nextProfile.understeerTendency = Math.min(10, nextProfile.understeerTendency + 1);
        break;
      case 'less_oversteer':
        adjust('rearWingAero', 2, 'Add rear wing support to stabilize the rear axle');
        adjust('rearAntiRollBar', -1, 'Soften rear ARB to prevent snap oversteer');
        adjust('diffAdjustmentOnThrottle', -5, 'Smooth out throttle locking on corner exit');
        nextProfile.oversteerTendency = Math.min(10, nextProfile.oversteerTendency + 1);
        break;
      case 'more_rear_stability':
        adjust('rearWingAero', 2, 'Increase rear downforce to plant the rear end');
        adjust('rearToeIn', 0.03, 'Add rear toe-in for high-speed directional stability');
        adjust('rearSuspension', -2, 'Soften rear suspension to keep rear tyres planted over bumps');
        nextProfile.rearStability = Math.min(10, nextProfile.rearStability + 1);
        break;
      case 'better_traction':
        adjust('diffAdjustmentOnThrottle', -5, 'Reduce sudden rear tyre slip on throttle application');
        adjust('rearSuspension', -2, 'Improve rear mechanical weight transfer on exit');
        adjust('rearRightTyrePressure', -0.2, 'Widen rear contact patch for exit traction');
        adjust('rearLeftTyrePressure', -0.2, 'Widen rear contact patch for exit traction');
        break;
      case 'better_braking_stability':
        adjust('frontBrakeBias', 1, 'Shift brake bias forward to prevent rear lock-ups under braking');
        adjust('brakePressure', -2, 'Slightly moderate peak pressure to avoid front lock-ups');
        adjust('engineBraking', -10, 'Reduce sudden engine-braking drag on downshifts');
        break;
      case 'less_tyre_wear':
        adjust('frontCamber', 0.2, 'Reduce negative front camber to ease inside-shoulder wear');
        adjust('rearCamber', 0.1, 'Reduce rear camber scrub over long stints');
        adjust('frontToeOut', -0.02, 'Reduce front toe-out drag on straights');
        nextProfile.tyreWearPriority = Math.min(10, nextProfile.tyreWearPriority + 1);
        break;
      case 'better_qualifying_pace':
        adjust('frontSuspension', 2, 'Stiffen front platform for faster transient response');
        adjust('frontCamber', -0.1, 'Add peak lateral camber grip for a single flying lap');
        adjust('brakePressure', 2, 'Increase stopping power for late qualifying braking points');
        nextProfile.paceVsConsistency = Math.max(1, nextProfile.paceVsConsistency - 1);
        break;
      case 'better_race_consistency':
        adjust('frontSuspension', -2, 'Widen suspension compliance window for fuel-load changes');
        adjust('rearRideHeight', 1, 'Add slight floor margin over kerbs on heavy fuel');
        adjust('brakePressure', -1, 'Add braking modulation margin over a full race distance');
        nextProfile.paceVsConsistency = Math.min(10, nextProfile.paceVsConsistency + 1);
        break;
    }
  }

  const nextParameters = normalizeAllParameters(nextRaw, gameVersion);
  const diffSummary: SetupVersionRecord['diffSummary'] = [];

  for (const key of PARAMETER_ORDER) {
    if (nextParameters[key] !== currentParameters[key]) {
      const spec = specs[key];
      const reasons = reasonMap.get(key) ?? ['Refined from driver session feedback'];
      diffSummary.push({
        key,
        label: spec.label,
        previous: currentParameters[key],
        next: nextParameters[key],
        unit: spec.unit,
        reason: Array.from(new Set(reasons)).join('; '),
      });
    }
  }

  const nextAnalysis = buildSetupAnalysis(
    nextParameters,
    {
      gameVersion,
      circuitId: params.circuitId,
      weather: params.weather,
      sessionType: params.sessionType,
      profile: nextProfile,
    },
    circuit,
    params.researchEntries ?? []
  );

  const appliedSummary =
    diffSummary.length > 0
      ? `Applied ${diffSummary.length} targeted adjustment${diffSummary.length === 1 ? '' : 's'} based on your feedback.`
      : 'Values already sit at the safe boundary for the requested feedback.';

  return {
    nextParameters,
    nextAnalysis,
    nextProfile,
    diffSummary,
    appliedSummary,
  };
}

export function formatSetupClipboard(setup: {
  title: string;
  gameVersion: GameVersion;
  circuitName: string;
  weather: WeatherType;
  sessionType: SessionType;
  compatibilityScore: number;
  parameters: SetupParameters;
}): string {
  const specs = GAME_VERSIONS[setup.gameVersion].parameters;
  const sections: Array<ParameterSpecLike['section']> = [
    'Aerodynamics',
    'Transmission',
    'Suspension Geometry',
    'Suspension',
    'Brakes',
    'Tyres',
  ];

  const lines: string[] = [
    `RS SETUPS — EA Sports F1 25`,
    `${setup.title}`,
    `Version: ${GAME_VERSIONS[setup.gameVersion].fullLabel}`,
    `Circuit: ${setup.circuitName} | Weather: ${setup.weather.toUpperCase()} | Session: ${setup.sessionType.replace('_', ' ').toUpperCase()}`,
    `Personal Compatibility Score: ${setup.compatibilityScore}%`,
    ``,
  ];

  for (const section of sections) {
    lines.push(`[${section}]`);
    for (const key of PARAMETER_ORDER) {
      const spec = specs[key];
      if (spec.section === section) {
        lines.push(`- ${spec.label}: ${formatParamValue(setup.parameters[key], spec)}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

type ParameterSpecLike = {
  section:
    | 'Aerodynamics'
    | 'Transmission'
    | 'Suspension Geometry'
    | 'Suspension'
    | 'Brakes'
    | 'Tyres';
};
