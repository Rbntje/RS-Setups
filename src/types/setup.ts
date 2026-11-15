export type GameVersion = 'f1_25_2025' | 'f1_25_2026_pack';

export type WeatherType = 'dry' | 'wet';

export type SessionType = 'qualifying' | 'race' | 'time_trial' | 'practice';

export type BalanceBias = 'understeer' | 'neutral' | 'oversteer';

export type CornerPhase = 'entry' | 'mid' | 'exit' | 'none';

export type FeedbackTag =
  | 'more_top_speed'
  | 'more_cornering_grip'
  | 'less_understeer'
  | 'less_oversteer'
  | 'more_rear_stability'
  | 'better_traction'
  | 'better_braking_stability'
  | 'less_tyre_wear'
  | 'better_qualifying_pace'
  | 'better_race_consistency';

export interface SetupParameters {
  frontWingAero: number;
  rearWingAero: number;
  diffAdjustmentOnThrottle: number;
  diffAdjustmentOffThrottle: number;
  engineBraking: number;
  frontCamber: number;
  rearCamber: number;
  frontToeOut: number;
  rearToeIn: number;
  frontSuspension: number;
  rearSuspension: number;
  frontAntiRollBar: number;
  rearAntiRollBar: number;
  frontRideHeight: number;
  rearRideHeight: number;
  brakePressure: number;
  frontBrakeBias: number;
  frontRightTyrePressure: number;
  frontLeftTyrePressure: number;
  rearRightTyrePressure: number;
  rearLeftTyrePressure: number;
}

export type SetupParameterKey = keyof SetupParameters;

export interface ParameterSpec {
  key: SetupParameterKey;
  label: string;
  section:
    | 'Aerodynamics'
    | 'Transmission'
    | 'Suspension Geometry'
    | 'Suspension'
    | 'Brakes'
    | 'Tyres';
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals: number;
  verified: boolean;
  verificationNote?: string;
}

export interface GameVersionSpec {
  id: GameVersion;
  shortLabel: string;
  fullLabel: string;
  subtitle: string;
  specNote: string;
  parameters: Record<SetupParameterKey, ParameterSpec>;
}

export interface CircuitSpec {
  id: string;
  name: string;
  country: string;
  round: number;
  lengthKm: number;
  downforceDemand: number; // 1..10
  topSpeedPriority: number; // 1..10
  kerbSeverity: number; // 1..10
  tyreStress: number; // 1..10
  brakingDemand: number; // 1..10
  tractionDemand: number; // 1..10
  wetSensitivity: number; // 1..10
  dominantLimitation: 'rear_traction' | 'front_limited' | 'aero_efficiency' | 'balanced';
  engineeringNotes: string;
}

export interface DrivingProfile {
  id?: string;
  userId?: string;
  gameVersion: GameVersion;
  speedVsGrip: number; // 1 = max top speed, 10 = max cornering grip
  rearStability: number; // 1 = loose/agile rear, 10 = planted rear
  carAggression: number; // 1 = predictable/safe, 10 = sharp/aggressive
  understeerTendency: number; // 1 = rarely, 10 = frequently experiences understeer
  understeerPhase: CornerPhase;
  oversteerTendency: number; // 1 = rarely, 10 = frequently experiences oversteer
  oversteerPhase: CornerPhase;
  tyreWearPriority: number; // 1 = pure pace, 10 = maximum tyre life
  paceVsConsistency: number; // 1 = qualifying single-lap, 10 = race consistency
  limitConfidence: number; // 1 = cautious on limit, 10 = confident on limit
  wetConfidence: number; // 1 = cautious in rain, 10 = aggressive in rain
  wizardCompleted: boolean;
  updatedAt?: string;
}

export interface SetupAdjustmentNote {
  section: ParameterSpec['section'];
  parameterLabels: string;
  reasoning: string;
}

export interface SetupSourceReference {
  title: string;
  url: string;
  sourceType: string;
  collectedAt: string;
  note: string;
}

export interface SetupAnalysis {
  compatibilityScore: number; // 0..100 personal fit
  suitabilitySummary: string;
  suitabilityDistinction: string;
  explanations: SetupAdjustmentNote[];
  advantages: string[];
  disadvantages: string[];
  sources: SetupSourceReference[];
}

export interface SetupVersionRecord {
  id: string;
  setupId: string;
  versionNumber: number;
  parameters: SetupParameters;
  analysis: SetupAnalysis;
  feedbackApplied: FeedbackTag[];
  feedbackNotes: string;
  diffSummary: Array<{
    key: SetupParameterKey;
    label: string;
    previous: number;
    next: number;
    unit: string;
    reason: string;
  }>;
  createdAt: string;
}

export interface SetupFolder {
  id: string;
  name: string;
  systemDefault?: boolean;
  createdAt: string;
}

export interface SavedSetup {
  id: string;
  userId: string;
  folderId: string;
  title: string;
  gameVersion: GameVersion;
  circuitId: string;
  circuitName: string;
  weather: WeatherType;
  sessionType: SessionType;
  raceTyreFocus: boolean;
  raceConsistencyFocus: boolean;
  isFavourite: boolean;
  currentVersion: number;
  parameters: SetupParameters;
  analysis: SetupAnalysis;
  versions?: SetupVersionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  teamName: string;
  role: string;
  preferredGameVersion: GameVersion;
  lastCircuitId: string;
  createdAt: string;
}

export interface ResearchSource {
  id: string;
  name: string;
  url: string;
  adapterType: 'rss' | 'json_feed' | 'html_page' | 'submitted_url';
  gameVersion: GameVersion | 'both';
  enabled: boolean;
  lastStatus: 'never_run' | 'reachable' | 'parsed' | 'unavailable' | 'robots_blocked' | 'no_setup_data';
  lastMessage: string;
  lastCheckedAt: string | null;
}

export interface ResearchResult {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  circuitId: string | null;
  circuitName: string;
  gameVersion: GameVersion;
  weather: WeatherType;
  sessionType: SessionType;
  title: string;
  summary: string;
  extractedParameters: Partial<SetupParameters>;
  collectedAt: string;
}

export interface ResearchStatusSummary {
  lastRunAt: string | null;
  refreshIntervalHours: number;
  isOutdated: boolean;
  totalResults: number;
  sourcesCount: number;
  healthySourcesCount: number;
}
