import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="sBTC Escrow logo"
    >
      {/* Shield shape */}
      <path
        d="M16 2L4 7v9c0 7.73 5.12 14.95 12 17 6.88-2.05 12-9.27 12-17V7L16 2z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M16 2L4 7v9c0 7.73 5.12 14.95 12 17 6.88-2.05 12-9.27 12-17V7L16 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Lock body */}
      <rect
        x="11"
        y="14"
        width="10"
        height="8"
        rx="1.5"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Lock shackle */}
      <path
        d="M13 14v-3a3 3 0 0 1 6 0v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bitcoin B keyhole */}
      <path
        d="M15.2 16.5h1.3c.55 0 1 .35 1 .8s-.45.8-1 .8h-1.3v-1.6zm0 1.6h1.3c.55 0 1 .35 1 .8s-.45.8-1 .8h-1.3v-1.6z"
        fill="hsl(var(--background))"
      />
    </svg>
  );
}
