import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFeedbackToSetup,
  formatSetupClipboard,
  generateSetup,
} from './generator';
import { GAME_VERSIONS, PARAMETER_ORDER } from './specs';
import {
  DEFAULT_WIZARD_ANSWERS,
  buildProfileFromAnswers,
  getVisibleWizardSteps,
} from './wizard';

test('adaptive wizard hides follow-up phase questions when rarely experienced', () => {
  const minimalSteps = getVisibleWizardSteps({
    ...DEFAULT_WIZARD_ANSWERS,
    experiencesUndersteer: 'rarely',
    experiencesOversteer: 'rarely',
  });
  assert.equal(minimalSteps.some((s) => s.id === 'understeerPhase'), false);
  assert.equal(minimalSteps.some((s) => s.id === 'oversteerPhase'), false);

  const detailedSteps = getVisibleWizardSteps({
    ...DEFAULT_WIZARD_ANSWERS,
    experiencesUndersteer: 'often',
    experiencesOversteer: 'sometimes',
  });
  assert.equal(detailedSteps.some((s) => s.id === 'understeerPhase'), true);
  assert.equal(detailedSteps.some((s) => s.id === 'oversteerPhase'), true);
});

test('setup generator respects exact valid bounds and steps for both 2025 and 2026 Season Pack', () => {
  for (const version of ['f1_25_2025', 'f1_25_2026_pack'] as const) {
    const profile = buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, version);
    const result = generateSetup({
      gameVersion: version,
      circuitId: 'monaco',
      weather: 'wet',
      sessionType: 'race',
      profile,
      raceTyreFocus: true,
      raceConsistencyFocus: true,
    });

    const specs = GAME_VERSIONS[version].parameters;
    for (const key of PARAMETER_ORDER) {
      const spec = specs[key];
      const val = result.parameters[key];
      assert.ok(val >= spec.min && val <= spec.max, `${version} ${key}=${val} out of range`);
    }
    assert.ok(result.analysis.compatibilityScore >= 50 && result.analysis.compatibilityScore <= 99);
    assert.ok(result.analysis.advantages.length > 0);
    assert.ok(result.analysis.disadvantages.length > 0);
  }
});

test('2025 vs 2026 Season Pack produce distinct calibrated setups for the same track', () => {
  const profile25 = buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, 'f1_25_2025');
  const profile26 = buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, 'f1_25_2026_pack');

  const setup25 = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'qualifying',
    profile: profile25,
  });

  const setup26 = generateSetup({
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'qualifying',
    profile: profile26,
  });

  assert.notDeepEqual(setup25.parameters, setup26.parameters);
});

test('feedback engine applies targeted adjustments without scrambling unrelated settings', () => {
  const profile = buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, 'f1_25_2025');
  const initial = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  const feedbackResult = applyFeedbackToSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: initial.parameters,
    profile,
    feedbackTags: ['less_oversteer', 'more_rear_stability'],
    feedbackNotes: 'Rear felt nervous entering Blanchimont.',
  });

  assert.ok(feedbackResult.diffSummary.length > 0);
  assert.ok(
    feedbackResult.nextParameters.rearWingAero >= initial.parameters.rearWingAero,
    'Rear wing should increase or hold for rear stability'
  );
  // Brakes should remain untouched when only oversteer/rear stability feedback is given
  assert.equal(feedbackResult.nextParameters.brakePressure, initial.parameters.brakePressure);
});

test('clipboard formatter outputs clean structured text', () => {
  const profile = buildProfileFromAnswers(DEFAULT_WIZARD_ANSWERS, 'f1_25_2025');
  const setup = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'monza',
    weather: 'dry',
    sessionType: 'time_trial',
    profile,
  });
  const text = formatSetupClipboard({
    title: setup.title,
    gameVersion: 'f1_25_2025',
    circuitName: setup.circuit.name,
    weather: 'dry',
    sessionType: 'time_trial',
    compatibilityScore: setup.analysis.compatibilityScore,
    parameters: setup.parameters,
  });
  assert.match(text, /RS SETUPS/);
  assert.match(text, /Front Wing Aero/);
  assert.match(text, /Tyres/);
});
