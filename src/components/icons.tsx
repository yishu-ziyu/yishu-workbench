/** Moxt-like monochrome rail icons (SVG, currentColor) */

type Props = { className?: string; size?: number };

const s = (n = 20) => ({ width: n, height: n, className: "shrink-0" as const });

export function IconChat(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4 3.5V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconFolder(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <path d="M3.5 8.5V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-6.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUsers(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.2" />
      <path d="M3.5 18c.8-2.5 2.8-4 5.5-4s4.7 1.5 5.5 4" strokeLinecap="round" />
      <path d="M15 18c.4-1.4 1.5-2.5 3.5-2.5 1.2 0 2.1.4 2.7 1" strokeLinecap="round" />
    </svg>
  );
}

export function IconWorkflow(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <rect x="3.5" y="4" width="6" height="6" rx="1.5" />
      <rect x="14.5" y="14" width="6" height="6" rx="1.5" />
      <path d="M9.5 7h3.5a2 2 0 0 1 2 2v5" strokeLinecap="round" />
      <path d="M15 9.5 17.5 7 20 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPuzzle(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <path d="M9 4h3v2.2a1.8 1.8 0 1 0 0 3.6V12h2.2a1.8 1.8 0 1 0 3.6 0H20v3h-2.2a1.8 1.8 0 1 0 0 3.6H20V20h-6v-2.2a1.8 1.8 0 1 0-3.6 0V20H4v-6h2.2a1.8 1.8 0 1 0 0-3.6H4V4h5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClock(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconLink(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.6l-1.1 1" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 1 0 5.7 5.6l1.1-1" strokeLinecap="round" />
    </svg>
  );
}

export function IconGift(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M4 13h16M12 10v10" />
      <path d="M12 10c-2-3.5-5.5-3-5.5-1S9 11 12 10c2-3.5 5.5-3 5.5-1S15 11 12 10Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBell(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <path d="M7 10a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5H5.5S7 14 7 10Z" strokeLinejoin="round" />
      <path d="M10.5 18.5a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...s(p.size)} className={p.className}>
      <path d="M12 6v12M6 12h12" strokeLinecap="round" />
    </svg>
  );
}

export function IconSend(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...s(p.size)} className={p.className}>
      <path d="M12 18V7M7.5 11.5 12 7l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  );
}

export function IconMic(p: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" {...s(p.size)} className={p.className}>
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M7 11a5 5 0 0 0 10 0M12 16v3" strokeLinecap="round" />
    </svg>
  );
}
