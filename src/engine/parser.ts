import type { GameVersion, SetupParameters, SetupParameterKey } from '../types/setup';
import { GAME_VERSIONS, PARAMETER_ORDER, clampAndStep } from './specs';

export interface ParsedSetupResult {
  extracted: Partial<SetupParameters>;
  matchedKeys: SetupParameterKey[];
  summary: string;
}

const KEY_PATTERNS: Array<{ key: SetupParameterKey; patterns: RegExp[] }> = [
  {
    key: 'frontWingAero',
    patterns: [
      /front\s*wing(?:\s*aero)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\bfw\b\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'rearWingAero',
    patterns: [
      /rear\s*wing(?:\s*aero)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\brw\b\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'diffAdjustmentOnThrottle',
    patterns: [
      /(?:diff(?:erential)?\s*)?on[\s\-]*throttle\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /on\s*throttle\s*diff(?:erential)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'diffAdjustmentOffThrottle',
    patterns: [
      /(?:diff(?:erential)?\s*)?off[\s\-]*throttle\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /off\s*throttle\s*diff(?:erential)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'engineBraking',
    patterns: [/engine\s*braking\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontCamber',
    patterns: [/front\s*camber\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'rearCamber',
    patterns: [/rear\s*camber\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontToeOut',
    patterns: [/front\s*toe(?:\s*out)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'rearToeIn',
    patterns: [/rear\s*toe(?:\s*in)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontSuspension',
    patterns: [/front\s*suspension\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'rearSuspension',
    patterns: [/rear\s*suspension\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontAntiRollBar',
    patterns: [
      /front\s*(?:anti[\s\-]*roll\s*bar|arb)\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'rearAntiRollBar',
    patterns: [
      /rear\s*(?:anti[\s\-]*roll\s*bar|arb)\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'frontRideHeight',
    patterns: [/front\s*ride\s*height\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'rearRideHeight',
    patterns: [/rear\s*ride\s*height\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'brakePressure',
    patterns: [/brake\s*pressure\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontBrakeBias',
    patterns: [/(?:front\s*)?brake\s*bias\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i],
  },
  {
    key: 'frontRightTyrePressure',
    patterns: [
      /front\s*right\s*(?:tyre|tire)?\s*pressures?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\bfr\b\s*(?:tyre|tire)?\s*(?:psi|pressure)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'frontLeftTyrePressure',
    patterns: [
      /front\s*left\s*(?:tyre|tire)?\s*pressures?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\bfl\b\s*(?:tyre|tire)?\s*(?:psi|pressure)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'rearRightTyrePressure',
    patterns: [
      /rear\s*right\s*(?:tyre|tire)?\s*pressures?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\brr\b\s*(?:tyre|tire)?\s*(?:psi|pressure)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
  {
    key: 'rearLeftTyrePressure',
    patterns: [
      /rear\s*left\s*(?:tyre|tire)?\s*pressures?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
      /\brl\b\s*(?:tyre|tire)?\s*(?:psi|pressure)?\s*[:=\-]?\s*(-?\d+(?:\.\d+)?)/i,
    ],
  },
];

/**
 * Parses pasted community / guide setup text on-device and clamps values
 * to the exact regulation boundaries of the chosen EA Sports F1 25 car spec.
 */
export function parseSetupTextToParameters(
  rawText: string,
  gameVersion: GameVersion
): ParsedSetupResult {
  const specs = GAME_VERSIONS[gameVersion].parameters;
  const extracted: Partial<SetupParameters> = {};
  const matchedKeys: SetupParameterKey[] = [];
  const text = rawText.replace(/,/g, '.').replace(/[°%]/g, ' ');

  // Support shorthand "Wings: 34/32" or "Aero: 34 - 32"
  const wingPair = text.match(/(?:wings?|aero)\s*[:=\-]?\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})/i);
  if (wingPair) {
    extracted.frontWingAero = clampAndStep(Number(wingPair[1]), specs.frontWingAero);
    extracted.rearWingAero = clampAndStep(Number(wingPair[2]), specs.rearWingAero);
  }

  for (const entry of KEY_PATTERNS) {
    if (extracted[entry.key] !== undefined) continue;
    for (const pattern of entry.patterns) {
      const m = text.match(pattern);
      if (m && m[1] !== undefined) {
        const val = Number(m[1]);
        if (!Number.isNaN(val)) {
          extracted[entry.key] = clampAndStep(val, specs[entry.key]);
          break;
        }
      }
    }
  }

  // Fallback for generic "Front Tyre Pressure: 23.8" / "Rear Tyre Pressure: 21.5"
  if (extracted.frontLeftTyrePressure === undefined && extracted.frontRightTyrePressure === undefined) {
    const frontPsi = text.match(/front\s*(?:tyre|tire)\s*pressures?\s*[:=\-]?\s*(\d{2}(?:\.\d+)?)/i);
    if (frontPsi) {
      const clamped = clampAndStep(Number(frontPsi[1]), specs.frontLeftTyrePressure);
      extracted.frontLeftTyrePressure = clamped;
      extracted.frontRightTyrePressure = clamped;
    }
  }
  if (extracted.rearLeftTyrePressure === undefined && extracted.rearRightTyrePressure === undefined) {
    const rearPsi = text.match(/rear\s*(?:tyre|tire)\s*pressures?\s*[:=\-]?\s*(\d{2}(?:\.\d+)?)/i);
    if (rearPsi) {
      const clamped = clampAndStep(Number(rearPsi[1]), specs.rearLeftTyrePressure);
      extracted.rearLeftTyrePressure = clamped;
      extracted.rearRightTyrePressure = clamped;
    }
  }

  for (const k of PARAMETER_ORDER) {
    if (extracted[k] !== undefined) matchedKeys.push(k);
  }

  const summary =
    matchedKeys.length > 0
      ? `Extracted ${matchedKeys.length} setup parameters clamped to ${GAME_VERSIONS[gameVersion].shortLabel} limits.`
      : 'Saved reference note locally (no numeric F1 25 setup values detected in the text).';

  return { extracted, matchedKeys, summary };
}
