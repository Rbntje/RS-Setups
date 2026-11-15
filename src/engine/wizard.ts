import type { CornerPhase, DrivingProfile, GameVersion } from '../types/setup';

export interface WizardAnswers {
  speedVsGrip: number;
  rearStability: number;
  carAggression: number;
  experiencesUndersteer: 'rarely' | 'sometimes' | 'often';
  understeerPhase: CornerPhase;
  experiencesOversteer: 'rarely' | 'sometimes' | 'often';
  oversteerPhase: CornerPhase;
  tyreWearPriority: number;
  paceVsConsistency: number;
  limitConfidence: number;
  wetConfidence: number;
}

export interface WizardStep {
  id: keyof WizardAnswers;
  title: string;
  subtitle: string;
  type: 'scale' | 'choice';
  minLabel?: string;
  maxLabel?: string;
  choices?: Array<{ value: string; label: string; detail: string }>;
  condition?: (answers: WizardAnswers) => boolean;
}

export const DEFAULT_WIZARD_ANSWERS: WizardAnswers = {
  speedVsGrip: 6,
  rearStability: 7,
  carAggression: 5,
  experiencesUndersteer: 'sometimes',
  understeerPhase: 'mid',
  experiencesOversteer: 'sometimes',
  oversteerPhase: 'exit',
  tyreWearPriority: 6,
  paceVsConsistency: 6,
  limitConfidence: 6,
  wetConfidence: 5,
};

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'speedVsGrip',
    title: 'Do you prefer higher top speed or more cornering grip?',
    subtitle: 'Controls baseline aerodynamic wing compromise and DRS efficiency.',
    type: 'scale',
    minLabel: 'Higher top speed',
    maxLabel: 'More cornering grip',
  },
  {
    id: 'rearStability',
    title: 'How important is rear-end stability?',
    subtitle: 'Higher values plant the rear axle through fast sweeps and heavy braking.',
    type: 'scale',
    minLabel: 'Loose & agile rear',
    maxLabel: 'Planted & stable rear',
  },
  {
    id: 'carAggression',
    title: 'Do you prefer a predictable or aggressive car?',
    subtitle: 'Determines steering sharpness, anti-roll stiffness, and front toe response.',
    type: 'scale',
    minLabel: 'Calm & predictable',
    maxLabel: 'Sharp & aggressive',
  },
  {
    id: 'experiencesUndersteer',
    title: 'Do you frequently experience understeer?',
    subtitle: 'Front tyres washing wide when turning into or holding a corner.',
    type: 'choice',
    choices: [
      { value: 'rarely', label: 'Rarely', detail: 'Front end usually turns in cleanly where I point it.' },
      { value: 'sometimes', label: 'Sometimes', detail: 'Occurs mainly on heavy fuel or high-speed sweepers.' },
      { value: 'often', label: 'Often', detail: 'I struggle to get the nose to the apex consistently.' },
    ],
  },
  {
    id: 'understeerPhase',
    title: 'When does your understeer happen most?',
    subtitle: 'Adaptive follow-up: targets front geometry, ARB balance, or off-throttle diff.',
    type: 'choice',
    condition: (a) => a.experiencesUndersteer !== 'rarely',
    choices: [
      { value: 'entry', label: 'During corner entry', detail: 'Car resists turning in while trailing off the brake.' },
      { value: 'mid', label: 'During the middle of a corner', detail: 'Nose pushes wide once steering lock is held.' },
      { value: 'exit', label: 'During corner exit', detail: 'Car washes wide when applying throttle.' },
    ],
  },
  {
    id: 'experiencesOversteer',
    title: 'Do you experience oversteer?',
    subtitle: 'Rear end stepping out or threatening to spin under braking or throttle.',
    type: 'choice',
    choices: [
      { value: 'rarely', label: 'Rarely', detail: 'I feel confident keeping the rear behind me.' },
      { value: 'sometimes', label: 'Sometimes', detail: 'Happens over kerbs or on worn tyres.' },
      { value: 'often', label: 'Often', detail: 'The rear steps out easily and requires frequent corrections.' },
    ],
  },
  {
    id: 'oversteerPhase',
    title: 'When does your oversteer happen most?',
    subtitle: 'Adaptive follow-up: tunes brake bias, off-throttle diff, or on-throttle diff.',
    type: 'choice',
    condition: (a) => a.experiencesOversteer !== 'rarely',
    choices: [
      { value: 'entry', label: 'During corner entry', detail: 'Rear steps out on initial turn-in or heavy downshifts.' },
      { value: 'mid', label: 'During the middle of a corner', detail: 'Rear slides laterally when carrying mid-corner speed.' },
      { value: 'exit', label: 'During corner exit', detail: 'Rear snaps when getting back on the throttle.' },
    ],
  },
  {
    id: 'tyreWearPriority',
    title: 'How important is tyre wear management?',
    subtitle: 'Balances camber aggression and tyre pressures against stint longevity.',
    type: 'scale',
    minLabel: 'Pure short-run pace',
    maxLabel: 'Maximum tyre life',
  },
  {
    id: 'paceVsConsistency',
    title: 'Do you prioritise qualifying pace or race consistency?',
    subtitle: 'Shapes default fuel-weight balance, suspension stiffness, and risk margin.',
    type: 'scale',
    minLabel: 'Qualifying peak pace',
    maxLabel: 'Race consistency',
  },
  {
    id: 'limitConfidence',
    title: 'How confident are you when driving on the limit?',
    subtitle: 'Adjusts brake pressure, differential locking, and aero platform tolerance.',
    type: 'scale',
    minLabel: 'Prefer safety margin',
    maxLabel: 'Comfortable on the edge',
  },
  {
    id: 'wetConfidence',
    title: 'How confident are you in wet conditions?',
    subtitle: 'Tailors wet-weather ride height, differential unlocking, and brake bias.',
    type: 'scale',
    minLabel: 'Need maximum wet stability',
    maxLabel: 'Aggressive in the wet',
  },
];

export function getVisibleWizardSteps(answers: WizardAnswers): WizardStep[] {
  return WIZARD_STEPS.filter((step) => !step.condition || step.condition(answers));
}

export function buildProfileFromAnswers(
  answers: WizardAnswers,
  gameVersion: GameVersion,
  existingId?: string
): DrivingProfile {
  const tendencyMap = { rarely: 2, sometimes: 5, often: 8 } as const;

  return {
    id: existingId,
    gameVersion,
    speedVsGrip: answers.speedVsGrip,
    rearStability: answers.rearStability,
    carAggression: answers.carAggression,
    understeerTendency: tendencyMap[answers.experiencesUndersteer],
    understeerPhase: answers.experiencesUndersteer === 'rarely' ? 'none' : answers.understeerPhase,
    oversteerTendency: tendencyMap[answers.experiencesOversteer],
    oversteerPhase: answers.experiencesOversteer === 'rarely' ? 'none' : answers.oversteerPhase,
    tyreWearPriority: answers.tyreWearPriority,
    paceVsConsistency: answers.paceVsConsistency,
    limitConfidence: answers.limitConfidence,
    wetConfidence: answers.wetConfidence,
    wizardCompleted: true,
  };
}

export function createDefaultProfile(gameVersion: GameVersion): DrivingProfile {
  return buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, gameVersion);
}
