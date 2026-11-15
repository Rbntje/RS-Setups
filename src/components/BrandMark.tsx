import React from 'react';

export const BrandMark: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'sm' ? 'w-8 h-8 rounded-xl' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-9 h-9 rounded-xl';
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <div
      className={`${dim} flex items-center justify-center bg-gradient-to-br from-[#0A2558] via-[#0B4F9E] to-[#1D6FE8] text-white font-bold tracking-tight shadow-[0_6px_16px_rgba(11,79,158,0.28)] shrink-0`}
      aria-hidden="true"
    >
      <span className={textSize}>RS</span>
    </div>
  );
};
