"use client";

interface BridgeIconProps {
  className?: string;
  size?: number;
}

export default function BridgeIcon({ className = "", size = 40 }: BridgeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Arch / bridge base */}
      <path
        d="M4 28 C4 16 14 8 20 8 C26 8 36 16 36 28"
        stroke="#16C172"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Road deck */}
      <line x1="2" y1="28" x2="38" y2="28" stroke="#1A1A2E" strokeWidth="3" strokeLinecap="round" />
      {/* Left cable */}
      <line x1="20" y1="8" x2="8" y2="28" stroke="#16C172" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
      {/* Right cable */}
      <line x1="20" y1="8" x2="32" y2="28" stroke="#16C172" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
      {/* Center pillar dot */}
      <circle cx="20" cy="8" r="2.5" fill="#16C172" />
      {/* AI spark — small star above */}
      <circle cx="30" cy="6" r="1.5" fill="#16C172" opacity="0.7" />
      <circle cx="34" cy="10" r="1" fill="#16C172" opacity="0.5" />
      <circle cx="27" cy="3" r="1" fill="#16C172" opacity="0.4" />
    </svg>
  );
}
