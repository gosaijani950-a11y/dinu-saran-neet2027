import React, { useState } from 'react';

const LION_LOGO_URL = 'https://i.ibb.co/zTX9KKD5/botdp.jpg';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  initials?: string;
  className?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-7 h-7 rounded-lg text-[11px]',
  md: 'w-9 h-9 rounded-xl text-xs',
  lg: 'w-11 h-11 rounded-xl text-sm',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'sm',
  initials = 'DS',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`${SIZE_CLASSES[size]} inline-flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-amber-400/40 bg-[#0B0E14] ${className}`}
    >
      {failed ? (
        <span className="w-full h-full bg-[#6366F1] text-white font-bold tracking-tight flex items-center justify-center">
          {initials}
        </span>
      ) : (
        <img
          src={LION_LOGO_URL}
          alt="DINU SARAN Logo"
          onError={() => setFailed(true)}
          className="object-cover w-full h-full"
        />
      )}
    </span>
  );
};
