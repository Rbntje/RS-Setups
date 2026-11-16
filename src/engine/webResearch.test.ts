import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProfile } from './wizard';
import { generateSetup } from './generator';
import { diagnoseAndTuneWithCodedAi } from './setupAi';
import {
  mergeOnlineConsensusIntoDiagnosis,
  parseBingResultsHtml,
  parseF1LapsMetaHtml,
  parseF1LapsOverviewHtml,
} from './webResearch';

test('parseF1LapsMetaHtml extracts and clamps live 21-parameter consensus setup from HTML', () => {
  const sampleHtml = `
    <html><body>
      <div>Aerodynamics Front Wing 0 50 Rear Wing 0 50</div>
      <div>
        The Setup You Need Copy these values directly into your game.
        Based on the top 100 fastest setups for Italy (Monza).
        Aerodynamics Front Wing 0 Rear Wing 0
        Transmission Differential On Throttle 85% Differential Off Throttle 30%
        Suspension Geometry Front Camber -3.50° Rear Camber -2° Front Toe 0.00° Rear Toe 0.11°
        Suspension Front Suspension 38 Rear Suspension 5 Front Anti-Roll Bar 10 Rear Anti-Roll Bar 9.50
        Front Ride Height 22 Rear Ride Height 48
        Brakes Front Brake Bias 55% Brake Pressure 100%
        Tyres Front Right Tyre Pressure 28.75psi Front Left Tyre Pressure 29.50psi
        Rear Right Tyre Pressure 22psi Rear Left Tyre Pressure 22psi
      </div>
    </body></html>
  `;

  const parsed = parseF1LapsMetaHtml(sampleHtml, 'f1_25_2025');
  assert.equal(parsed.matchedCount, 20);
  assert.equal(parsed.parameters.frontWingAero, 0);
  assert.equal(parsed.parameters.rearWingAero, 0);
  assert.equal(parsed.parameters.diffAdjustmentOnThrottle, 85);
  assert.equal(parsed.parameters.diffAdjustmentOffThrottle, 30);
  assert.equal(parsed.parameters.frontRideHeight, 22);
  assert.equal(parsed.parameters.rearRideHeight, 48);
  assert.equal(parsed.parameters.frontBrakeBias, 55);
  assert.equal(parsed.sampleSizeNote, 'top 100 fastest setups for Italy (Monza)');
});

test('parseF1LapsOverviewHtml & parseBingResultsHtml extract real site summaries', () => {
  const ov = parseF1LapsOverviewHtml(
    `<p>Where the fastest drivers agree: front wing 0, rear wing 0, rear camber -2°. See more.</p>`
  );
  assert.equal(ov, 'front wing 0, rear wing 0, rear camber -2°.');

  const bingHtml = `
    <ol id="b_results">
      <li class="b_algo">
        <h2><a href="https://simracingsetup.com/f1-25-car-setups/italy/">F1 25 Monza Setup Guide</a></h2>
        <div class="b_caption"><p>Fastest Monza race setup with low aero drag for top speed.</p></div>
      </li>
    </ol>
  `;
  const results = parseBingResultsHtml(bingHtml);
  assert.equal(results.length, 1);
  assert.equal(results[0].domain, 'simracingsetup.com');
  assert.ok(results[0].snippet.includes('Fastest Monza race setup'));
});

test('mergeOnlineConsensusIntoDiagnosis blends online consensus safely with driver stability', () => {
  const profile = createDefaultProfile('f1_25_2025');
  profile.rearStability = 7;

  const setup = generateSetup({
    gameVersion: 'f1_25_2025',
    circuitId: 'monza',
    weather: 'dry',
    sessionType: 'race',
    profile,
  });

  const base = diagnoseAndTuneWithCodedAi({
    prompt: 'zoek online wat echt het beste is voor Monza',
    gameVersion: 'f1_25_2025',
    circuitId: 'monza',
    weather: 'dry',
    sessionType: 'race',
    currentParameters: setup.parameters,
    profile,
  });

  const merged = mergeOnlineConsensusIntoDiagnosis({
    baseDiagnosis: base,
    web: {
      ok: true,
      fetchedAt: new Date().toISOString(),
      circuitId: 'monza',
      circuitName: 'Monza',
      gameVersion: 'f1_25_2025',
      metaUrl: 'https://www.f1laps.com/f1-25/setups/monza/meta/',
      webSources: [
        {
          title: 'F1Laps Monza Fastest Drivers Meta',
          url: 'https://www.f1laps.com/f1-25/setups/monza/meta/',
          domain: 'f1laps.com',
          snippet: 'front wing 0, rear wing 0',
        },
      ],
      consensusParameters: {
        frontWingAero: 0,
        rearWingAero: 0,
        diffAdjustmentOnThrottle: 85,
        diffAdjustmentOffThrottle: 30,
        frontRideHeight: 22,
        rearRideHeight: 48,
        frontBrakeBias: 55,
        brakePressure: 100,
      },
      matchedParameterCount: 8,
      driverConsensusNote: 'front wing 0, rear wing 0',
      sampleSizeNote: 'top 100 fastest setups for Monza',
    },
    currentParameters: setup.parameters,
    gameVersion: 'f1_25_2025',
    weather: 'dry',
    sessionType: 'race',
    circuitName: 'Monza',
    prompt: 'zoek online wat echt het beste is voor Monza',
    profile,
  });

  assert.ok(merged.webSources && merged.webSources.length >= 1);
  assert.ok(merged.searchedSources.some((s) => s.includes('f1laps.com')));
  assert.ok(merged.recommendedDiffs.length >= 1);
  // Race safety guardrail prevents raw 30% TT off-throttle snapping
  assert.ok(merged.nextParameters.diffAdjustmentOffThrottle >= 40);
});
