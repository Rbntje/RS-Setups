import type {
  DrivingProfile,
  GameVersion,
  ResearchResult,
  SessionType,
  SetupParameters,
  WeatherType,
} from '../types/setup';
import { getCircuitById } from './generator';
import {
  diagnoseAndTuneWithCodedAi,
  findMentionedCircuit,
  type AiChatTurn,
  type CodedAiDiagnosis,
  type LocalAiBrain,
} from './setupAi';
import {
  mergeOnlineConsensusIntoDiagnosis,
  type WebResearchPayload,
} from './webResearch';

/**
 * Queries the Express server (/api/ai/web-research) to visit live F1 setup websites
 * (F1Laps Meta + Bing Web Search), and falls back cleanly offline without throwing.
 */
export async function fetchLiveWebResearch(input: {
  prompt: string;
  circuitId: string;
  gameVersion: GameVersion;
  weather: WeatherType;
  sessionType: SessionType;
}): Promise<WebResearchPayload | null> {
  const targetCircuit = findMentionedCircuit(input.prompt) ?? getCircuitById(input.circuitId);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    const res = await fetch('/api/ai/web-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        circuitId: targetCircuit.id,
        circuitName: targetCircuit.name,
        gameVersion: input.gameVersion,
        weather: input.weather,
        sessionType: input.sessionType,
        prompt: input.prompt,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = (await res.json()) as WebResearchPayload;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export async function runOnlineAwareAiDiagnosis(input: {
  prompt: string;
  gameVersion: GameVersion;
  circuitId: string;
  weather: WeatherType;
  sessionType: SessionType;
  currentParameters: SetupParameters;
  profile: DrivingProfile;
  aiBrain?: LocalAiBrain;
  references?: ResearchResult[];
  conversationHistory?: AiChatTurn[];
  onWebStage?: (stageLabel: string) => void;
}): Promise<{ diagnosis: CodedAiDiagnosis; webUsed: boolean; webPayload: WebResearchPayload | null }> {
  const targetCircuit = findMentionedCircuit(input.prompt) ?? getCircuitById(input.circuitId);
  input.onWebStage?.(`Visiting websites for ${targetCircuit.name}...`);

  const webPayload = await fetchLiveWebResearch({
    prompt: input.prompt,
    circuitId: input.circuitId,
    gameVersion: input.gameVersion,
    weather: input.weather,
    sessionType: input.sessionType,
  });

  if (webPayload?.ok) {
    input.onWebStage?.(
      `Read ${webPayload.webSources.length} site${webPayload.webSources.length === 1 ? '' : 's'} · Comparing best online meta...`
    );
  } else {
    input.onWebStage?.('Analyzing 24-circuit physics & locally learned online memory...');
  }

  const baseDiagnosis = diagnoseAndTuneWithCodedAi({
    prompt: input.prompt,
    gameVersion: input.gameVersion,
    circuitId: input.circuitId,
    weather: input.weather,
    sessionType: input.sessionType,
    currentParameters: input.currentParameters,
    profile: input.profile,
    aiBrain: input.aiBrain,
    references: input.references,
    conversationHistory: input.conversationHistory,
  });

  const merged = mergeOnlineConsensusIntoDiagnosis({
    baseDiagnosis,
    web: webPayload,
    currentParameters: input.currentParameters,
    gameVersion: input.gameVersion,
    weather: input.weather,
    sessionType: input.sessionType,
    circuitName: targetCircuit.name,
    prompt: input.prompt,
    profile: input.profile,
  });

  return {
    diagnosis: merged,
    webUsed: Boolean(webPayload?.ok),
    webPayload,
  };
}
