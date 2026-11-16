import React from 'react';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Custom vector motorsport apex-wing crest (pure precision geometry, no generic letter-box).
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'md' }) => {
  const dim =
    size === 'sm'
      ? 'w-8 h-8 rounded-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 rounded-[15px]'
        : 'w-10 h-10 rounded-[12px]';

  return (
    <div
      className={`${dim} relative flex items-center justify-center bg-gradient-to-b from-[#0E1E38] to-[#07101F] border border-white/15 shadow-[0_8px_18px_rgba(7,16,31,0.34)] shrink-0 overflow-hidden select-none`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className="w-[72%] h-[72%]"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top Forward Aero Blade */}
        <path
          d="M7 13.5L19.5 7.5L32.5 11.5L25.5 15.5L15 13L10.5 16L7 13.5Z"
          fill="#FFFFFF"
        />
        {/* Swept Chicane S-Curve Telemetry Ribbon */}
        <path
          d="M9.5 22.5C13.5 17 20.5 17 24.5 20.5C27.5 23 30 22.5 33 19.5L30.5 25.5C26.5 29.5 21 29.5 17 26C14 23.5 11.5 24 8.5 27L9.5 22.5Z"
          fill="#0A84FF"
        />
        {/* Precision Apex Kerb Triangle Accent */}
        <path d="M12.5 31.5L26 31.5L28.5 28.5L15 28.5L12.5 31.5Z" fill="#EF4444" />
      </svg>
    </div>
  );
};
