import React, { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-xl border border-[#C6DAF7] bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#0B4F9E] shadow-md backdrop-blur-md whitespace-nowrap"
    >
      <HardDrive className="w-3.5 h-3.5 text-[#0B4F9E]" />
      <span>Offline · All setups &amp; engine working locally</span>
    </div>
  );
};
