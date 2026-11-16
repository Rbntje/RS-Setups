import type { CircuitSpec, GameVersion, WeatherType } from '../types/setup';
import { CIRCUITS } from './specs';
import { getCircuitById } from './generator';
import { getOnlineKnowledgeKey, type LocalAiBrain } from './setupAi';
import { fetchLiveWebResearch } from './liveWebClient';
import type { WebResearchPayload } from './webResearch';

export interface LearningTarget {
  circuit: CircuitSpec;
  gameVersion: GameVersion;
  weather: WeatherType;
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Selects the next circuit/version/weather pair that the on-device AI should learn online.
 * Priority:
 * 1) Active/preferred circuit (dry) on preferredGameVersion if missing or stale
 * 2) Any unlearned dry circuit on preferredGameVersion (all 24 tracks)
 * 3) Any unlearned dry circuit on the secondary car spec
 * 4) Wet meta setups for active/high-rain tracks
 * 5) Oldest stale entry to refresh
 */
export function pickNextCircuitToLearn(
  aiBrain: LocalAiBrain,
  preferredGameVersion: GameVersion,
  activeCircuitId: string,
  nowMs = Date.now()
): LearningTarget {
  const knowledge = aiBrain.onlineCircuitKnowledge ?? {};
  const secondaryVersion: GameVersion =
    preferredGameVersion === 'f1_25_2026_pack' ? 'f1_25_2025' : 'f1_25_2026_pack';

  const isFresh = (gv: GameVersion, cid: string, weather: WeatherType): boolean => {
    const entry = knowledge[getOnlineKnowledgeKey(gv, cid, weather)];
    if (!entry) return false;
    const age = nowMs - new Date(entry.learnedAt).getTime();
    return Number.isFinite(age) && age < STALE_AFTER_MS;
  };

  // 1. Prioritize active track on preferred spec
  if (!isFresh(preferredGameVersion, activeCircuitId, 'dry')) {
    return {
      circuit: getCircuitById(activeCircuitId),
      gameVersion: preferredGameVersion,
      weather: 'dry',
    };
  }

  // 2. Sweep all 24 dry circuits on preferred spec
  for (const circuit of CIRCUITS) {
    if (!isFresh(preferredGameVersion, circuit.id, 'dry')) {
      return { circuit, gameVersion: preferredGameVersion, weather: 'dry' };
    }
  }

  // 3. Sweep all 24 dry circuits on secondary spec
  for (const circuit of CIRCUITS) {
    if (!isFresh(secondaryVersion, circuit.id, 'dry')) {
      return { circuit, gameVersion: secondaryVersion, weather: 'dry' };
    }
  }

  // 4. Wet weather setups for active circuit + classic wet circuits
  const wetPriorityIds = [activeCircuitId, 'spa', 'silverstone', 'interlagos', 'suzuka', 'zandvoort'];
  for (const cid of wetPriorityIds) {
    if (!isFresh(preferredGameVersion, cid, 'wet')) {
      return { circuit: getCircuitById(cid), gameVersion: preferredGameVersion, weather: 'wet' };
    }
  }

  // 5. Refresh the stalest existing entry or loop cleanly from active circuit
  const entries = Object.values(knowledge);
  if (entries.length > 0) {
    const oldest = [...entries].sort((a, b) => a.learnedAt.localeCompare(b.learnedAt))[0];
    return {
      circuit: getCircuitById(oldest.circuitId),
      gameVersion: oldest.gameVersion,
      weather: oldest.weather,
    };
  }

  return {
    circuit: getCircuitById(activeCircuitId),
    gameVersion: preferredGameVersion,
    weather: 'dry',
  };
}

export function countLearnedCircuits(aiBrain: LocalAiBrain): {
  uniqueCircuits: number;
  totalEntries: number;
} {
  const entries = Object.values(aiBrain.onlineCircuitKnowledge ?? {});
  const uniqueIds = new Set(entries.map((e) => e.circuitId));
  return {
    uniqueCircuits: uniqueIds.size,
    totalEntries: entries.length,
  };
}

export async function fetchTargetOnlineKnowledge(
  target: LearningTarget
): Promise<WebResearchPayload | null> {
  return fetchLiveWebResearch({
    prompt: `Check live fastest setup meta for ${target.circuit.name}`,
    circuitId: target.circuit.id,
    gameVersion: target.gameVersion,
    weather: target.weather,
    sessionType: 'race',
  });
}
