import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProfile } from './wizard';
import { generateSetup } from './generator';
import {
  createInitialAiBrain,
  diagnoseAndTuneWithCodedAi,
  trainAiBrainFromDeltas,
} from './setupAi';
import { GAME_VERSIONS, PARAMETER_ORDER } from './specs';

test('coded AI diagnoses English & Dutch handling complaints and respects car spec bounds', () => {
  const profile = createDefaultProfile('f1_25_2026_pack');
  const setup = generateSetup({
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  const diag = diagnoseAndTuneWithCodedAi({
    prompt: 'Achterkant breekt uit bij gas geven uit langzame bochten',
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });

  assert.ok(diag.recommendedDiffs.length >= 1);
  assert.ok(diag.detectedSymptoms.some((s) => s.toLowerCase().includes('oversteer')));
  assert.ok(diag.nextParameters.rearWingAero >= setup.parameters.rearWingAero);
  assert.ok(diag.nextParameters.diffAdjustmentOnThrottle <= setup.parameters.diffAdjustmentOnThrottle);

  // Strict bounds validation for 2026 Pack
  const specs = GAME_VERSIONS.f1_25_2026_pack.parameters;
  for (const key of PARAMETER_ORDER) {
    const val = diag.nextParameters[key];
    assert.ok(val >= specs[key].min && val <= specs[key].max, `${key} out of 2026 bounds: ${val}`);
  }
});

test('coded AI explain prompt inspects setup without modifying parameters', () => {
  const profile = createDefaultProfile('f1_25_2025');
  const setup = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'monza',
    weather: 'dry',
    sessionType: 'qualifying',
    profile,
  });

  const diag = diagnoseAndTuneWithCodedAi({
    prompt: 'Explain why these wings and rake are chosen',
    gameVersion: 'f1_25_2025',
    circuitId: 'monza',
    weather: 'dry',
    sessionType: 'qualifying',
    currentParameters: setup.parameters,
    profile,
  });

  assert.equal(diag.recommendedDiffs.length, 0);
  assert.deepEqual(diag.nextParameters, setup.parameters);
  assert.ok(diag.engineerReply.includes('Monza'));
});

test('coded AI brain learns per-track biases and keeps 2025 vs 2026 Pack isolated', () => {
  const profile25 = createDefaultProfile('f1_25_2025');
  const profile26 = createDefaultProfile('f1_25_2026_pack');

  const before25 = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    profile: profile25,
  });

  let brain = createInitialAiBrain();
  brain = trainAiBrainFromDeltas(brain, {
    gameVersion: 'f1_25_2025',
    circuitId: 'silverstone',
    deltas: [
      { key: 'rearWingAero', delta: 4 },
      { key: 'frontWingAero', delta: 3 },
    ],
    insightSummary: 'Silverstone 2025: added high-speed wing stability',
  });

  const after25 = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    profile: profile25,
    aiBrain: brain,
  });

  assert.ok(after25.parameters.rearWingAero > before25.parameters.rearWingAero);
  assert.ok(after25.analysis.advantages.some((a) => a.includes('Tuned by RS Coded AI')));

  // 2026 track bias map remains untouched by 2025 Silverstone training
  assert.equal(brain.trackBiases['f1_25_2026_pack:silverstone'], undefined);
  assert.ok(profile26.gameVersion === 'f1_25_2026_pack');
});
