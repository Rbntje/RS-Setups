import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import {
  buildIpaDownloadUrls,
  formatBytesCompact,
  normalizeGithubRepoInput,
  resolveGithubRepo,
  type IpaAvailabilityState,
} from '../utils/ipaDownload';

interface IpaDownloadCardProps {
  variant?: 'sidebar' | 'full';
  savedRepo: string;
  onSaveRepo?: (repo: string) => Promise<void>;
}

export const IpaDownloadCard: React.FC<IpaDownloadCardProps> = ({
  variant = 'full',
  savedRepo,
  onSaveRepo,
}) => {
  const [repoInput, setRepoInput] = useState(savedRepo);
  const [showModal, setShowModal] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);
  const [repoErr, setRepoErr] = useState<string | null>(null);

  useEffect(() => {
    setRepoInput(savedRepo);
  }, [savedRepo]);

  const envRepo = (import.meta.env.VITE_GITHUB_REPO as string | undefined) || '';
  const baseUrl = import.meta.env.BASE_URL || '/';

  const resolvedRepo = useMemo(() => {
    if (typeof window === 'undefined') {
      return resolveGithubRepo({ envRepo, savedRepo });
    }
    return resolveGithubRepo({
      envRepo,
      savedRepo,
      locationHostname: window.location.hostname,
      locationPathname: window.location.pathname,
    });
  }, [envRepo, savedRepo]);

  const urls = useMemo(
    () => buildIpaDownloadUrls(resolvedRepo, baseUrl),
    [resolvedRepo, baseUrl]
  );

  const [availability, setAvailability] = useState<IpaAvailabilityState>({
    status: 'checking',
    downloadUrl: null,
    sizeBytes: null,
    updatedAt: null,
    sourceLabel: 'Checking build...',
  });

  const probeAvailability = async () => {
    setAvailability((prev) => ({
      ...prev,
      status: 'checking',
      sourceLabel: 'Checking IPA build...',
    }));

    // 1. Check same-origin /downloads/RS-Setups-unsigned.ipa (bundled into GitHub Pages dist)
    try {
      const headRes = await fetch(urls.sameOriginIpaUrl, { method: 'HEAD' });
      const contentType = (headRes.headers.get('content-type') || '').toLowerCase();
      const contentLength = Number(headRes.headers.get('content-length') || '0');
      if (headRes.ok && !contentType.includes('text/html') && (contentLength === 0 || contentLength > 10000)) {
        setAvailability({
          status: 'ready',
          downloadUrl: urls.sameOriginIpaUrl,
          sizeBytes: contentLength > 0 ? contentLength : null,
          updatedAt: headRes.headers.get('last-modified'),
          sourceLabel: 'Direct Website Package',
        });
        return;
      }
    } catch {
      // Fall through to GitHub Release probe
    }

    // 2. Check GitHub Release `ipa-latest` if repository is known
    if (urls.releaseApiUrl && urls.releaseDirectIpaUrl) {
      try {
        const apiRes = await fetch(urls.releaseApiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (apiRes.ok) {
          const data = (await apiRes.json()) as {
            assets?: Array<{
              name?: string;
              size?: number;
              browser_download_url?: string;
              updated_at?: string;
            }>;
          };
          const ipaAsset = data.assets?.find((a) =>
            (a.name || '').toLowerCase().endsWith('.ipa')
          );
          if (ipaAsset?.browser_download_url) {
            setAvailability({
              status: 'ready',
              downloadUrl: ipaAsset.browser_download_url,
              sizeBytes: ipaAsset.size ?? null,
              updatedAt: ipaAsset.updated_at ?? null,
              sourceLabel: 'GitHub Release (ipa-latest)',
            });
            return;
          }
        }
      } catch {
        // Ignore network errors (e.g. offline)
      }

      setAvailability({
        status: 'pending_build',
        downloadUrl: null,
        sizeBytes: null,
        updatedAt: null,
        sourceLabel: `${resolvedRepo} (awaiting Actions IPA build)`,
      });
      return;
    }

    setAvailability({
      status: 'no_repo',
      downloadUrl: null,
      sizeBytes: null,
      updatedAt: null,
      sourceLabel: 'Push to GitHub to auto-build .IPA',
    });
  };

  useEffect(() => {
    void probeAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.sameOriginIpaUrl, urls.releaseApiUrl]);

  const handleSaveRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoErr(null);
    const trimmed = repoInput.trim();
    if (!trimmed) {
      if (onSaveRepo) {
        setSavingRepo(true);
        await onSaveRepo('');
        setSavingRepo(false);
      }
      return;
    }
    const normalized = normalizeGithubRepoInput(trimmed);
    if (!normalized) {
      setRepoErr('Enter owner/repo (e.g. ruben/rs-setups) or full GitHub link.');
      return;
    }
    if (onSaveRepo) {
      setSavingRepo(true);
      try {
        await onSaveRepo(normalized);
      } finally {
        setSavingRepo(false);
      }
    }
  };

  const buttonLabel =
    availability.status === 'ready'
      ? `Download iPhone .IPA (${formatBytesCompact(availability.sizeBytes)})`
      : 'Download iPhone .IPA';

  return (
    <>
      {variant === 'sidebar' ? (
        <div className="liquid-glass rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0A192F]">
              <Smartphone className="w-3.5 h-3.5 text-[#0B4F9E]" />
              <span>iPhone App (.IPA)</span>
            </div>
            {availability.status === 'ready' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                Ready
              </span>
            )}
          </div>

          {availability.status === 'ready' && availability.downloadUrl ? (
            <a
              href={availability.downloadUrl}
              download="RS-Setups-unsigned.ipa"
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F9E] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#093E7E] transition-colors min-h-[42px] whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{buttonLabel}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F9E] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#093E7E] transition-colors min-h-[42px] cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Download iPhone .IPA</span>
            </button>
          )}

          <p className="text-[11px] text-[#64748B] leading-snug">
            {availability.status === 'ready'
              ? `Direct unsigned .IPA (${availability.sourceLabel}). Sideload with AltStore or Sideloadly.`
              : 'Auto-built via macOS GitHub Actions on push. Tap to link your repo or check build.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#C6DAF7] bg-[#F4F8FF] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#0A192F]">Direct iOS .IPA Download</div>
            <button
              type="button"
              onClick={() => void probeAvailability()}
              aria-label="Refresh IPA build status"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B4F9E] hover:underline cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${availability.status === 'checking' ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>

          <p className="text-[11px] text-[#526581] leading-relaxed">
            {availability.status === 'ready'
              ? `Latest unsigned iPhone package is ready (${formatBytesCompact(availability.sizeBytes)}). Install via AltStore, Sideloadly, or Xcode.`
              : 'Once pushed to GitHub, GitHub Actions builds the native Capacitor iPhone .IPA automatically so you can download it directly here.'}
          </p>

          {availability.status === 'ready' && availability.downloadUrl ? (
            <a
              href={availability.downloadUrl}
              download="RS-Setups-unsigned.ipa"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4F9E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#093E7E] min-h-[44px] transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{buttonLabel}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4F9E] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#093E7E] min-h-[44px] cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Download iPhone .IPA</span>
            </button>
          )}
        </div>
      )}

      {showModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0A192F]/50 backdrop-blur-sm p-3 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ipa-modal-title"
          >
            <div className="liquid-glass w-full max-w-sm rounded-3xl p-5 text-[#0A192F] space-y-3.5 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 id="ipa-modal-title" className="text-base font-bold">
                    Download RS Setups (.IPA)
                  </h3>
                  <p className="text-[11px] text-[#526581] mt-0.5">
                    {availability.sourceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  aria-label="Close IPA download dialog"
                  className="w-8 h-8 rounded-xl bg-white/80 border border-[#DCE6F5] flex items-center justify-center text-[#475569] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {availability.status === 'ready' && availability.downloadUrl ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#334155] leading-relaxed">
                    Your compiled unsigned iOS package (
                    <strong>{formatBytesCompact(availability.sizeBytes)}</strong>) is ready to
                    download directly.
                  </p>
                  <a
                    href={availability.downloadUrl}
                    download="RS-Setups-unsigned.ipa"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F9E] px-4 py-3 text-xs font-bold text-white hover:bg-[#093E7E] min-h-[44px]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download RS-Setups-unsigned.ipa</span>
                  </a>
                </div>
              ) : (
                <div className="space-y-3 text-xs text-[#334155] leading-relaxed">
                  <p>
                    iPhone <code className="font-mono-tabular">.ipa</code> binaries must be compiled by
                    Xcode on macOS. This project already includes a ready-to-run macOS GitHub Actions
                    builder that publishes <code className="font-mono-tabular">ipa-latest</code>{' '}
                    automatically when you push to GitHub.
                  </p>

                  {onSaveRepo && (
                    <form onSubmit={handleSaveRepo} className="space-y-2 pt-1">
                      <label
                        htmlFor="ipa-repo-input"
                        className="block text-[11px] font-semibold text-[#0A192F]"
                      >
                        GitHub Repository (owner/repo)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          id="ipa-repo-input"
                          type="text"
                          value={repoInput}
                          onChange={(e) => setRepoInput(e.target.value)}
                          placeholder="e.g. ruben/rs-setups"
                          className="flex-1 min-w-0 rounded-xl border border-[#CBD8EC] bg-white px-3 py-2 text-xs min-h-[40px]"
                        />
                        <button
                          type="submit"
                          disabled={savingRepo}
                          className="rounded-xl bg-[#0B4F9E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#093E7E] min-h-[40px] cursor-pointer shrink-0"
                        >
                          {savingRepo ? '...' : 'Link'}
                        </button>
                      </div>
                      {repoErr && <p className="text-[11px] text-red-700">{repoErr}</p>}
                    </form>
                  )}

                  {urls.actionsBuildUrl && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <a
                        href={urls.actionsBuildUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#C6DAF7] bg-white px-3 py-2.5 text-xs font-semibold text-[#0B4F9E] hover:bg-[#EBF3FF] min-h-[40px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Run IPA Build</span>
                      </a>
                      {urls.releaseDirectIpaUrl && (
                        <a
                          href={urls.releaseDirectIpaUrl}
                          download="RS-Setups-unsigned.ipa"
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0B4F9E] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#093E7E] min-h-[40px]"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Direct .IPA</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full rounded-xl border border-[#CBD8EC] bg-white py-2.5 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] min-h-[42px] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
