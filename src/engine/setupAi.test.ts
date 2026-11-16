import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProfile } from './wizard';
import { generateSetup } from './generator';
import {
  createInitialAiBrain,
  diagnoseAndTuneWithCodedAi,
  getOnlineKnowledgeKey,
  recordOnlineLearningIntoBrain,
  trainAiBrainFromDeltas,
  trainAiBrainFromFeedbackOutcome,
} from './setupAi';
import { countLearnedCircuits, pickNextCircuitToLearn } from './realtimeLearner';
import { CIRCUITS, GAME_VERSIONS, PARAMETER_ORDER } from './specs';

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

test('coded AI handles Dutch general grip requests and wing questions intelligently', () => {
  const profile = createDefaultProfile('f1_25_2025');
  const setup = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  const gripDiag = diagnoseAndTuneWithCodedAi({
    prompt: 'Ik wil graag meer grip in de bochten want hij glijdt',
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });
  assert.ok(gripDiag.recommendedDiffs.length >= 2);
  assert.ok(gripDiag.engineerReply.includes('Spa-Francorchamps'));

  const whyDiag = diagnoseAndTuneWithCodedAi({
    prompt: 'Waarom staan mijn vleugels en diff zo?',
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });
  assert.equal(whyDiag.recommendedDiffs.length, 0);
  assert.ok(whyDiag.engineerReply.includes('vleugels'));
  assert.ok(whyDiag.engineerReply.includes('differentieel'));
});

test('coded AI looks up mentioned circuits and matches Setup Library references', () => {
  const profile = createDefaultProfile('f1_25_2025');
  const setup = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  const monzaLookup = diagnoseAndTuneWithCodedAi({
    prompt: 'Wat weet je over Monza?',
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
    references: [
      {
        id: 'ref-monza-1',
        sourceId: 'local-paste',
        sourceName: 'Community Esport',
        sourceUrl: '',
        circuitId: 'monza',
        circuitName: 'Monza',
        gameVersion: 'f1_25_2025',
        weather: 'dry',
        sessionType: 'race',
        title: 'Monza Low Drag Esport',
        summary: 'Low wings for straight-line Vmax',
        extractedParameters: {
          frontWingAero: setup.parameters.frontWingAero,
          rearWingAero: setup.parameters.rearWingAero,
          diffAdjustmentOnThrottle: setup.parameters.diffAdjustmentOnThrottle,
          diffAdjustmentOffThrottle: setup.parameters.diffAdjustmentOffThrottle,
        },
        collectedAt: new Date().toISOString(),
      },
    ],
  });

  assert.equal(monzaLookup.recommendedDiffs.length, 0);
  assert.ok(monzaLookup.searchedSources.some((s) => s.includes('Monza')));
  assert.ok(monzaLookup.searchedSources.some((s) => s.includes('Setup Library: 1 match')));
  assert.ok(monzaLookup.engineerReply.includes('Monza Low Drag Esport'));

  const searchAndTune = diagnoseAndTuneWithCodedAi({
    prompt: 'zoek tips voor Monza en meer grip',
    gameVersion: 'f1_25_2025',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });

  assert.ok(searchAndTune.recommendedDiffs.length >= 2);
  assert.ok(searchAndTune.searchedSources.some((s) => s.includes('Monza')));
  assert.ok(searchAndTune.engineerReply.includes('Monza'));
});

test('coded AI executes direct driver parameter commands and multi-turn follow-up escalations', () => {
  const profile = createDefaultProfile('f1_25_2026_pack');
  const setup = generateSetup({
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  // Explicit parameter setting in Dutch
  const directDiag = diagnoseAndTuneWithCodedAi({
    prompt: 'Zet voorvleugel naar 28 en rembalans naar 56',
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });
  assert.equal(directDiag.nextParameters.frontWingAero, 28);
  assert.equal(directDiag.nextParameters.frontBrakeBias, 56);
  assert.ok(directDiag.acknowledgedRequest?.includes('voorvleugel'));
  assert.ok(directDiag.followUpQuestion && directDiag.followUpQuestion.length > 0);

  // Follow-up escalation inheriting previous symptom from conversationHistory
  const followUpDiag = diagnoseAndTuneWithCodedAi({
    prompt: 'Helpt niet, nog steeds hetzelfde probleem',
    gameVersion: 'f1_25_2026_pack',
    circuitId: 'silverstone',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
    conversationHistory: [
      { role: 'user', text: 'Achterkant breekt uit bij gas geven' },
      { role: 'ai', text: 'Rear wing +2, Diff -6' },
    ],
  });
  assert.ok(followUpDiag.recommendedDiffs.length >= 1);
  assert.ok(followUpDiag.detectedSymptoms.some((s) => s.toLowerCase().includes('oversteer')));
  assert.ok(followUpDiag.engineerReply.includes('duidelijkere stap'));
});

test('coded AI records online web knowledge locally and processes direct user feedback outcomes', () => {
  const profile = createDefaultProfile('f1_25_2025');
  const base = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  let brain = createInitialAiBrain();
  brain = recordOnlineLearningIntoBrain(brain, {
    circuitId: 'spa',
    circuitName: 'Spa-Francorchamps',
    gameVersion: 'f1_25_2025',
    weather: 'dry',
    consensusParameters: {
      frontWingAero: base.parameters.frontWingAero + 2,
      rearWingAero: base.parameters.rearWingAero + 2,
    },
    matchedParameterCount: 8,
    domains: ['f1laps.com', 'simracingsetup.com'],
    driverConsensusNote: 'Balanced low-medium aero for Kemmel + Pouhon',
    sampleSizeNote: '6 sources',
    baselineParameters: base.parameters,
  });

  const spaKey = getOnlineKnowledgeKey('f1_25_2025', 'spa', 'dry');
  assert.ok(brain.onlineCircuitKnowledge?.[spaKey]);
  assert.equal(brain.onlineCircuitKnowledge?.[spaKey].matchedParameterCount, 8);
  assert.ok((brain.learningFeed ?? []).some((f) => f.kind === 'web_learn' && f.domains?.includes('f1laps.com')));

  // Verify realtimeLearner count & next circuit priority
  const counts = countLearnedCircuits(brain);
  assert.equal(counts.uniqueCircuits, 1);

  const nextTarget = pickNextCircuitToLearn(brain, 'f1_25_2025', 'spa');
  assert.notEqual(nextTarget.circuit.id, 'spa', 'Should skip freshly learned active Spa and advance to next circuit');
  assert.equal(nextTarget.gameVersion, 'f1_25_2025');

  // Verify user feedback outcome updates weights + history
  brain = trainAiBrainFromFeedbackOutcome(brain, {
    gameVersion: 'f1_25_2025',
    circuitId: 'spa',
    prompt: 'Snap exit Pouhon',
    outcome: 'still_oversteer',
  });
  assert.ok((brain.trackBiases['f1_25_2025:spa']?.rearWingAero ?? 0) > 0);
  assert.equal(brain.userFeedbackHistory?.[0].outcome, 'still_oversteer');
  assert.ok((brain.learningFeed ?? [])[0].kind === 'user_feedback');
});

test('pickNextCircuitToLearn sweeps all 24 dry circuits then wet tracks cleanly', () => {
  let brain = createInitialAiBrain();
  for (const circuit of CIRCUITS) {
    brain = recordOnlineLearningIntoBrain(brain, {
      circuitId: circuit.id,
      circuitName: circuit.name,
      gameVersion: 'f1_25_2026_pack',
      weather: 'dry',
      consensusParameters: {},
      matchedParameterCount: 4,
      domains: ['f1laps.com'],
      driverConsensusNote: null,
      sampleSizeNote: null,
    });
  }
  assert.equal(countLearnedCircuits(brain).uniqueCircuits, 24);
  const next = pickNextCircuitToLearn(brain, 'f1_25_2026_pack', 'monza');
  assert.equal(next.gameVersion, 'f1_25_2025', 'Once all 24 dry on 2026 are fresh, it moves to secondary spec');
});
