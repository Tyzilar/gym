// Line icons drawn to sit next to SF Pro text (24-unit grid, 1.8 stroke).

type P = { size?: number; className?: string; strokeWidth?: number };

function Svg({ size = 22, className, strokeWidth = 1.8, children, fill = "none" }: P & { children: React.ReactNode; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {children}
    </svg>
  );
}

export const DumbbellIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 12h9" />
    <rect x="4.5" y="7" width="3" height="10" rx="1.2" />
    <rect x="16.5" y="7" width="3" height="10" rx="1.2" />
    <path d="M2.5 10v4M21.5 10v4" />
  </Svg>
);
export const HistoryIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4.5v3.8h3.8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const ChartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 20v-6M10 20V9M15 20v-4M20 20V5" strokeWidth={(p.strokeWidth ?? 1.8) + 0.8} />
  </Svg>
);
export const ListIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M7.5 9h.01M7.5 12h.01M7.5 15h.01M11 9h6M11 12h6M11 15h6" />
  </Svg>
);
export const ChevronRight = (p: P) => (
  <Svg size={14} strokeWidth={2.4} {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
export const ChevronLeft = (p: P) => (
  <Svg size={22} strokeWidth={2.4} {...p}>
    <path d="m15 4-8 8 8 8" />
  </Svg>
);
export const ChevronDown = (p: P) => (
  <Svg size={14} strokeWidth={2.4} {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);
export const PlusIcon = (p: P) => (
  <Svg size={20} strokeWidth={2.2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const MinusIcon = (p: P) => (
  <Svg size={20} strokeWidth={2.2} {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const CheckIcon = (p: P) => (
  <Svg size={18} strokeWidth={2.8} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const MoreIcon = (p: P) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <circle cx="5.5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="18.5" cy="12" r="1.8" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <Svg size={17} strokeWidth={2.2} {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.6-4.6" />
  </Svg>
);
export const ShareIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </Svg>
);
export const DownloadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M8 11l4 4 4-4" />
    <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </Svg>
);
export const ArrowUp = (p: P) => (
  <Svg size={18} strokeWidth={2.2} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const ArrowDown = (p: P) => (
  <Svg size={18} strokeWidth={2.2} {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const MinusCircle = (p: P) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden className={p.className}>
    <circle cx="12" cy="12" r="10" fill="var(--red)" />
    <path d="M7 12h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
export const PlusCircle = (p: P) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden className={p.className}>
    <circle cx="12" cy="12" r="10" fill="var(--tint)" />
    <path d="M12 7v10M7 12h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <Svg size={16} strokeWidth={2.4} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
