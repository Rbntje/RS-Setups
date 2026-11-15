export interface IpaDownloadUrls {
  repo: string | null;
  sameOriginIpaUrl: string;
  releaseDirectIpaUrl: string | null;
  releaseApiUrl: string | null;
  actionsBuildUrl: string | null;
  releasesPageUrl: string | null;
}

export interface IpaAvailabilityState {
  status: 'checking' | 'ready' | 'pending_build' | 'no_repo';
  downloadUrl: string | null;
  sizeBytes: number | null;
  updatedAt: string | null;
  sourceLabel: string;
}

export function normalizeGithubRepoInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Accept full GitHub URLs like https://github.com/user/repo or git@github.com:user/repo.git
  const urlMatch = trimmed.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git|\/.*)?$/i);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  // Accept owner/repo directly
  const slugMatch = trimmed.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  if (slugMatch?.[1]) {
    return slugMatch[1].replace(/\.git$/i, '');
  }

  return null;
}

export function resolveGithubRepo(opts: {
  envRepo?: string;
  savedRepo?: string;
  locationHostname?: string;
  locationPathname?: string;
}): string | null {
  const saved = opts.savedRepo ? normalizeGithubRepoInput(opts.savedRepo) : null;
  if (saved) return saved;

  const env = opts.envRepo ? normalizeGithubRepoInput(opts.envRepo) : null;
  if (env) return env;

  const host = (opts.locationHostname ?? '').toLowerCase();
  const path = opts.locationPathname ?? '';
  // Auto-detect GitHub Pages: https://<owner>.github.io/<repo>/...
  if (host.endsWith('.github.io')) {
    const owner = host.slice(0, -'.github.io'.length);
    const firstSegment = path.replace(/^\/+/, '').split('/')[0];
    if (owner && firstSegment) {
      return `${owner}/${firstSegment}`;
    }
  }

  return null;
}

export function buildIpaDownloadUrls(
  repo: string | null,
  baseUrl = '/'
): IpaDownloadUrls {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const sameOriginIpaUrl = `${normalizedBase}downloads/RS-Setups-unsigned.ipa`;

  if (!repo) {
    return {
      repo: null,
      sameOriginIpaUrl,
      releaseDirectIpaUrl: null,
      releaseApiUrl: null,
      actionsBuildUrl: null,
      releasesPageUrl: null,
    };
  }

  return {
    repo,
    sameOriginIpaUrl,
    releaseDirectIpaUrl: `https://github.com/${repo}/releases/download/ipa-latest/RS-Setups-unsigned.ipa`,
    releaseApiUrl: `https://api.github.com/repos/${repo}/releases/tags/ipa-latest`,
    actionsBuildUrl: `https://github.com/${repo}/actions/workflows/build-ios.yml`,
    releasesPageUrl: `https://github.com/${repo}/releases/tag/ipa-latest`,
  };
}

export function formatBytesCompact(bytes: number | null): string {
  if (!bytes || bytes <= 0) return 'iOS Package';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = Math.round(bytes / 1024);
  return `${kb} KB`;
}
