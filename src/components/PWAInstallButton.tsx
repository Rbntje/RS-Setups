import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({
  variant = 'compact',
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={handleInstall}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4F9E] text-white font-semibold transition-colors hover:bg-[#093E7E] whitespace-nowrap shrink-0 cursor-pointer ${
          variant === 'full' ? 'w-full px-4 py-3 text-sm min-h-[44px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>Install Phone App</span>
      </button>
    );
  }

  if (isIOS || variant === 'full') {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#C6DAF7] bg-white/85 text-[#0B4F9E] font-semibold transition-colors hover:bg-white whitespace-nowrap shrink-0 cursor-pointer ${
            variant === 'full' ? 'w-full px-4 py-3 text-sm min-h-[44px]' : 'px-3.5 py-2 text-xs min-h-[40px]'
          }`}
        >
          <Share className="w-4 h-4" />
          <span>Add to iPhone Home Screen</span>
        </button>

        {showIOSGuide &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#0A192F]/45 backdrop-blur-sm p-3 sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-ios-title"
            >
              <div className="liquid-glass w-full max-w-sm rounded-3xl p-6 text-[#0A192F]">
                <h3 id="pwa-ios-title" className="text-lg font-bold">
                  Install RS Setups on iPhone
                </h3>
                <p className="mt-2 text-sm text-[#475569] leading-relaxed">
                  1. Open this site in <strong>Safari</strong> on iPhone and tap the{' '}
                  <strong>Share</strong> button.
                  <br />
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
                <p className="mt-3 text-xs text-[#64748B]">
                  Works 100% offline. Your setups, driving profile, and feedback history stay saved directly on your phone.
                </p>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="mt-5 w-full rounded-xl bg-[#0B4F9E] py-3 text-sm font-semibold text-white hover:bg-[#093E7E] transition-colors cursor-pointer min-h-[44px]"
                >
                  Done
                </button>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return null;
};
