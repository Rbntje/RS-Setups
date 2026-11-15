import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSetupTextToParameters } from './parser';

test('parseSetupTextToParameters extracts and clamps community setup text', () => {
  const sample = `
    Silverstone Dry Race Setup
    Front Wing: 35
    Rear Wing: 32
    On Throttle: 55%
    Off Throttle: 45%
    Engine Braking: 60%
    Front Camber: -3.50
    Rear Camber: -2.00
    Front Toe: 0.04
    Rear Toe: 0.12
    Front Suspension: 31
    Rear Suspension: 15
    Front ARB: 13
    Rear ARB: 8
    Front Ride Height: 22
    Rear Ride Height: 48
    Brake Pressure: 100%
    Brake Bias: 55%
    FL Tyre Pressure: 24.0
    FR Tyre Pressure: 23.8
    RL Tyre Pressure: 21.4
    RR Tyre Pressure: 21.4
  `;

  const parsed = parseSetupTextToParameters(sample, 'f1_25_2025');
  assert.equal(parsed.matchedKeys.length, 21);
  assert.equal(parsed.extracted.frontWingAero, 35);
  assert.equal(parsed.extracted.rearWingAero, 32);
  assert.equal(parsed.extracted.frontCamber, -3.5);
  assert.equal(parsed.extracted.frontLeftTyrePressure, 24.0);
  assert.equal(parsed.extracted.rearRightTyrePressure, 21.4);
});

test('parseSetupTextToParameters clamps out-of-range values to 2026 Season Pack bounds', () => {
  const parsed = parseSetupTextToParameters('Wings: 50/50\nBrake Bias: 85%', 'f1_25_2026_pack');
  assert.equal(parsed.extracted.frontWingAero, 50);
  assert.equal(parsed.extracted.frontBrakeBias, 70);
});
