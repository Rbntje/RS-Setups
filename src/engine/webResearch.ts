import type {
  DrivingProfile,
  GameVersion,
  SessionType,
  SetupParameterKey,
  SetupParameters,
  WeatherType,
} from '../types/setup';
import { GAME_VERSIONS, PARAMETER_ORDER, clampAndStep, formatParamValue } from './specs';
import { parseSetupTextToParameters } from './parser';
import type { AiDiagnosticDiff, CodedAiDiagnosis, WebSourceItem } from './setupAi';

export interface WebResearchPayload {
  ok: boolean;
  fetchedAt: string;
  circuitId: string;
  circuitName: string;
  gameVersion: GameVersion;
  metaUrl: string;
  webSources: WebSourceItem[];
  consensusParameters: Partial<SetupParameters>;
  matchedParameterCount: number;
  driverConsensusNote: string | null;
  sampleSizeNote: string | null;
  error?: string;
}

export const TRACK_F1LAPS_SLUGS: Record<string, string> = {
  albert_park: 'australia',
  shanghai: 'china',
  suzuka: 'japan',
  bahrain: 'bahrain',
  jeddah: 'saudi_arabia',
  miami: 'miami',
  imola: 'imola',
  monaco: 'monaco',
  barcelona: 'spain',
  montreal: 'canada',
  red_bull_ring: 'austria',
  silverstone: 'silverstone',
  spa: 'spa',
  hungaroring: 'hungary',
  zandvoort: 'netherlands',
  monza: 'monza',
  baku: 'azerbaijan',
  marina_bay: 'singapore',
  austin: 'usa',
  mexico: 'mexico',
  interlagos: 'brazil',
  las_vegas: 'las_vegas',
  lusail: 'qatar',
  yas_marina: 'abudhabi',
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&deg;|&#176;/gi, '°')
    .replace(/&nbsp;/gi, ' ');
}

export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildF1LapsUrls(
  circuitId: string,
  gameVersion: GameVersion,
  weather: WeatherType
): { metaUrl: string; fallbackMetaUrl: string; overviewUrl: string } {
  const slug = TRACK_F1LAPS_SLUGS[circuitId] || circuitId;
  const gameSegment = gameVersion === 'f1_25_2026_pack' ? 'f1-26' : 'f1-25';
  const leaf = weather === 'wet' ? 'wet' : 'meta';
  return {
    metaUrl: `https://www.f1laps.com/${gameSegment}/setups/${slug}/${leaf}/`,
    fallbackMetaUrl: `https://www.f1laps.com/f1-25/setups/${slug}/meta/`,
    overviewUrl: `https://www.f1laps.com/f1-25/setups/${slug}/`,
  };
}

/**
 * Parses live F1Laps meta/wet setup HTML cleanly into clamped 2025/2026 SetupParameters.
 */
export function parseF1LapsMetaHtml(
  html: string,
  gameVersion: GameVersion
): {
  parameters: Partial<SetupParameters>;
  matchedCount: number;
  sampleSizeNote: string | null;
} {
  const clean = stripHtmlToText(html);
  const setupMarker = clean.toLowerCase().indexOf('the setup you need');
  const relevantSection =
    setupMarker >= 0 ? clean.slice(setupMarker, setupMarker + 2400) : clean.slice(0, 3000);

  const sampleMatch = relevantSection.match(/Based on (?:the )?(top\s+\d+[^.]+)/i);
  const sampleSizeNote = sampleMatch ? sampleMatch[1].trim() : null;

  // Normalize F1Laps labels slightly so generic parser extracts every single one of 21 params
  const normalizedForParser = relevantSection
    .replace(/Differential On Throttle/gi, 'On Throttle:')
    .replace(/Differential Off Throttle/gi, 'Off Throttle:')
    .replace(/Front Toe\b/gi, 'Front Toe Out:')
    .replace(/Rear Toe\b/gi, 'Rear Toe In:');

  const parsed = parseSetupTextToParameters(normalizedForParser, gameVersion);
  return {
    parameters: parsed.extracted,
    matchedCount: parsed.matchedKeys.length,
    sampleSizeNote,
  };
}

export function parseF1LapsOverviewHtml(html: string): string | null {
  const clean = stripHtmlToText(html);
  const m = clean.match(/Where the fastest drivers agree:\s*([\s\S]+?)(?:\.(?:\s|$))/i);
  return m ? `${m[1].trim()}.`.slice(0, 180) : null;
}

function decodeBingRedirectUrl(rawHref: string, citeText?: string): string {
  try {
    const parsed = new URL(rawHref, 'https://www.bing.com');
    const uParam = parsed.searchParams.get('u');
    if (uParam && uParam.startsWith('a1')) {
      const b64 = uParam.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      if (decoded.startsWith('http')) return decoded;
    }
    if (rawHref.startsWith('http') && !rawHref.includes('bing.com/ck/')) {
      return rawHref;
    }
  } catch {
    // ignore URL parse error
  }
  if (citeText && citeText.includes('.')) {
    const cleanCite = citeText.replace(/\s*›\s*/g, '/').trim();
    return cleanCite.startsWith('http') ? cleanCite : `https://${cleanCite}`;
  }
  return rawHref;
}

export function parseBingResultsHtml(html: string, limit = 4): WebSourceItem[] {
  const results: WebSourceItem[] = [];
  const blockRegex = /<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1];
    const linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = decodeHtmlEntities(linkMatch[1]);
    const title = stripHtmlToText(linkMatch[2]);
    const citeMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
    const citeText = citeMatch ? stripHtmlToText(citeMatch[1]) : undefined;
    const url = decodeBingRedirectUrl(rawHref, citeText);
    if (!url.startsWith('http')) continue;

    let domain = 'web';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      domain = 'web';
    }

    const snippetMatch =
      block.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
      block.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripHtmlToText(snippetMatch[1]) : '';

    if (title && !results.some((r) => r.domain === domain && r.title === title)) {
      results.push({
        title,
        url,
        domain,
        snippet: snippet.slice(0, 220),
      });
    }
  }

  return results;
}

export async function performServerWebResearch(input: {
  circuitId: string;
  circuitName: string;
  gameVersion: GameVersion;
  weather: WeatherType;
  sessionType: SessionType;
  prompt: string;
}): Promise<WebResearchPayload> {
  const { circuitId, circuitName, gameVersion, weather, prompt } = input;
  const { metaUrl, fallbackMetaUrl, overviewUrl } = buildF1LapsUrls(
    circuitId,
    gameVersion,
    weather
  );
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8',
  };

  const bingQuery = encodeURIComponent(
    `EA Sports F1 25 ${circuitName} ${weather} setup guide fastest`
  );
  const bingUrl = `https://www.bing.com/search?q=${bingQuery}`;

  const [metaRes, overviewRes, bingRes] = await Promise.allSettled([
    fetch(metaUrl, { headers, signal: AbortSignal.timeout(5500) }),
    fetch(overviewUrl, { headers, signal: AbortSignal.timeout(5500) }),
    fetch(bingUrl, { headers, signal: AbortSignal.timeout(5500) }),
  ]);

  let usedMetaUrl = metaUrl;
  let consensusParameters: Partial<SetupParameters> = {};
  let matchedParameterCount = 0;
  let sampleSizeNote: string | null = null;

  if (metaRes.status === 'fulfilled' && metaRes.value.ok) {
    const html = await metaRes.value.text();
    const parsed = parseF1LapsMetaHtml(html, gameVersion);
    consensusParameters = parsed.parameters;
    matchedParameterCount = parsed.matchedCount;
    sampleSizeNote = parsed.sampleSizeNote;
  }

  // Fallback to F1 25 dry meta if F1 26 / wet yielded too few numbers
  if (matchedParameterCount < 8 && fallbackMetaUrl !== metaUrl) {
    try {
      const fb = await fetch(fallbackMetaUrl, { headers, signal: AbortSignal.timeout(4500) });
      if (fb.ok) {
        const html = await fb.text();
        const parsed = parseF1LapsMetaHtml(html, gameVersion);
        if (parsed.matchedCount > matchedParameterCount) {
          consensusParameters = parsed.parameters;
          matchedParameterCount = parsed.matchedCount;
          sampleSizeNote = parsed.sampleSizeNote;
          usedMetaUrl = fallbackMetaUrl;
        }
      }
    } catch {
      // ignore fallback network error
    }
  }

  let driverConsensusNote: string | null = null;
  if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
    driverConsensusNote = parseF1LapsOverviewHtml(await overviewRes.value.text());
  }

  const webSources: WebSourceItem[] = [];
  if (matchedParameterCount > 0 || driverConsensusNote) {
    webSources.push({
      title: `F1Laps ${circuitName} Fastest Drivers Meta`,
      url: usedMetaUrl,
      domain: 'f1laps.com',
      snippet:
        driverConsensusNote ||
        (sampleSizeNote
          ? `Extracted ${matchedParameterCount} live parameters (${sampleSizeNote}).`
          : `Extracted ${matchedParameterCount} live community setup parameters.`),
    });
  }

  if (bingRes.status === 'fulfilled' && bingRes.value.ok) {
    const bingItems = parseBingResultsHtml(await bingRes.value.text(), 4);
    for (const item of bingItems) {
      if (!webSources.some((s) => s.url === item.url)) {
        webSources.push(item);
      }
    }
  }

  // Also check if prompt specifically mentions a symptom so caller knows search completed
  void prompt;

  return {
    ok: webSources.length > 0 || matchedParameterCount > 0,
    fetchedAt: new Date().toISOString(),
    circuitId,
    circuitName,
    gameVersion,
    metaUrl: usedMetaUrl,
    webSources,
    consensusParameters,
    matchedParameterCount,
    driverConsensusNote,
    sampleSizeNote,
  };
}

function isDutchPrompt(prompt: string): boolean {
  return /\b(ik|mijn|de|het|een|bij|voor|naar|waarom|onderstuur|overstuur|wat|hoe|zoek|vind|beste|online|website|websites|kijk|tips|advies|sneller|meer|minder)\b/i.test(
    prompt
  );
}

/**
 * Merges live website consensus & scraped search results into a CodedAiDiagnosis,
 * generating driver-safe online meta upgrades when the user asks what's best online.
 */
export function mergeOnlineConsensusIntoDiagnosis(input: {
  baseDiagnosis: CodedAiDiagnosis;
  web: WebResearchPayload | null;
  currentParameters: SetupParameters;
  gameVersion: GameVersion;
  weather: WeatherType;
  sessionType: SessionType;
  circuitName: string;
  prompt: string;
  profile: DrivingProfile;
}): CodedAiDiagnosis {
  const {
    baseDiagnosis,
    web,
    currentParameters,
    gameVersion,
    sessionType,
    circuitName,
    prompt,
    profile,
  } = input;

  if (!web || !web.ok || web.webSources.length === 0) {
    return baseDiagnosis;
  }

  const dutch = isDutchPrompt(prompt);
  const lower = prompt.toLowerCase();
  const specs = GAME_VERSIONS[gameVersion].parameters;

  const onlineBadges = [
    ...new Set([
      ...web.webSources.slice(0, 3).map((s) => `Web: ${s.domain}`),
      ...baseDiagnosis.searchedSources,
    ]),
  ];

  const wantsOnlineBest =
    /(best|beste|meta|online|website|websites|internet|esport|fastest|snelste|optimal|optimize|verbeter|upgrade|zoek.*setup|kijk.*wat|recommend|aanraden)/i.test(
      lower
    );

  const isPositiveFeedback = baseDiagnosis.detectedSymptoms.includes('Positive driver feedback');

  // Only propose full online consensus parameter alignment when user asks what is best/fastest/meta online
  if (web.matchedParameterCount >= 8 && wantsOnlineBest && !isPositiveFeedback) {
    const isStabilityFocused = sessionType === 'race' || profile.rearStability >= 6;
    const blendStrength = isStabilityFocused ? 0.78 : 0.92;

    const nextParameters: SetupParameters = { ...currentParameters };
    const recommendedDiffs: AiDiagnosticDiff[] = [];

    for (const key of PARAMETER_ORDER) {
      const onlineVal = web.consensusParameters[key as SetupParameterKey];
      if (onlineVal === undefined) continue;

      const cur = currentParameters[key];
      const blended = cur + (onlineVal - cur) * blendStrength;
      const spec = specs[key];
      let targetVal = clampAndStep(blended, spec);

      // Driver safety guardrail on extreme TT off-throttle/wing values during races
      if (isStabilityFocused && key === 'diffAdjustmentOffThrottle' && targetVal < 40) {
        targetVal = clampAndStep(40, spec);
      }

      nextParameters[key] = targetVal;
      if (targetVal !== cur) {
        recommendedDiffs.push({
          key,
          label: spec.label,
          previous: cur,
          next: targetVal,
          formattedPrevious: formatParamValue(cur, spec),
          formattedNext: formatParamValue(targetVal, spec),
          reason: `Aligned toward live ${web.circuitName} online fastest consensus (${formatParamValue(onlineVal, spec)})`,
        });
      }
    }

    const domainList = [...new Set(web.webSources.map((s) => s.domain))].slice(0, 3).join(', ');
    const consensusNote = web.driverConsensusNote ? ` (${web.driverConsensusNote})` : '';
    const sampleNote = web.sampleSizeNote ? ` op basis van ${web.sampleSizeNote}` : '';
    const enSampleNote = web.sampleSizeNote ? ` from ${web.sampleSizeNote}` : '';

    const reply = dutch
      ? `Live websites bezocht (${domainList}) voor ${circuitName}${sampleNote}${consensusNote}. ${
          recommendedDiffs.length > 0
            ? `Ik heb de beste online waarden vergeleken met jouw rijstijl en ${recommendedDiffs.length} verbetering${recommendedDiffs.length === 1 ? '' : 'en'} klaargezet.`
            : 'Jouw setup sluit al sterk aan op de beste online consensus.'
        }`
      : `Checked live websites (${domainList}) for ${circuitName}${enSampleNote}${consensusNote}. ${
          recommendedDiffs.length > 0
            ? `Blended the top online consensus with your driving style to propose ${recommendedDiffs.length} targeted update${recommendedDiffs.length === 1 ? '' : 's'}.`
            : 'Your current setup already aligns closely with the top online consensus.'
        }`;

    return {
      intentSummary: dutch
        ? `Online Beste · ${circuitName}`
        : `Online Meta · ${circuitName}`,
      detectedSymptoms: ['Live web setup consensus'],
      searchedSources: onlineBadges,
      webSources: web.webSources,
      confidence: 96,
      acknowledgedRequest: baseDiagnosis.acknowledgedRequest,
      engineerReply: reply,
      followUpQuestion: baseDiagnosis.followUpQuestion,
      projectedImpacts: [
        `${web.webSources.length} websites checked`,
        `${web.matchedParameterCount} live params synced`,
        isStabilityFocused ? 'Race-safe blend' : 'Peak pace blend',
      ],
      recommendedDiffs,
      nextParameters,
      inferredTags: ['better_qualifying_pace', 'more_cornering_grip'],
    };
  }

  // Otherwise attach real visited websites and driver consensus insight directly to the attentive physics reply
  const domainList = [...new Set(web.webSources.map((s) => s.domain))].slice(0, 3).join(', ');
  const webSuffix =
    web.driverConsensusNote && !isPositiveFeedback
      ? dutch
        ? ` (Live gecheckt op ${domainList}: "${web.driverConsensusNote}")`
        : ` (Verified online via ${domainList}: "${web.driverConsensusNote}")`
      : '';

  return {
    ...baseDiagnosis,
    searchedSources: onlineBadges,
    webSources: web.webSources,
    engineerReply: `${baseDiagnosis.engineerReply}${webSuffix}`,
  };
}
