import type { CSSProperties, ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>, plus: <path d="M12 5v14M5 12h14" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />, arrowUpRight: <path d="m5 19 14-14M6 5h13v13" />, arrowDownRight: <path d="m5 5 14 14M6 19h13V6" />, arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />, chevronRight: <path d="m9 5 7 7-7 7" />,
  refresh: <path d="M20 8a8 8 0 1 0 .1 8M20 3v5h-5" />, download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />, share: <path d="M12 15V3m-4 4 4-4 4 4M6 10H4v11h16V10h-2" />,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12a22 22 0 0 0 18 0M10 12v3h4v-3" /></>,
  chart: <path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4" />, signal: <path d="M3 17h3l3-10 5 14 3-10h4" />, check: <path d="m5 12 4 4L19 6" />, close: <path d="m6 6 12 12M6 18 18 6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.2" /></>,
  link: <><path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-5-6l5-5a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 0-6-5l-3 3M18 6a4 4 0 0 1 3 6l-5 5a4 4 0 0 1-6 0" /></>,
  trash: <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />, cloud: <path d="M7 18a5 5 0 1 1 0-10 7 7 0 0 1 13 3 4 4 0 0 1 0 8H7Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  filter: <path d="M4 7h16M7 12h10m-7 5h4" />, wifiOff: <path d="m3 3 18 18M2 8a16 16 0 0 1 5-3m5-1a16 16 0 0 1 10 4M5 12a11 11 0 0 1 5-3m5 1 4 2M9 16a5 5 0 0 1 6 0M12 20h.01" />,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="3" fill="currentColor" stroke="none" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6-6M7 8a6 6 0 1 0 10 8" /><circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" /></>,
  sparkles: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
};
export function Icon({ name, size = 22, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name] || paths.info}</svg>; }
