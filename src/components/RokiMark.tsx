/**
 * ROKI - the mark.
 * A rounded shell with two antennae (the cockroach: it survives everything),
 * with a rising line through it (then it grows). Amber dot = where it is now.
 */

export const RokiMark = ({ className = "w-8 h-8", title = "Roki" }: { className?: string; title?: string }) => (
  <svg viewBox="0 0 32 32" className={className} role="img" aria-label={title}>
    <path d="M13 10.5C12 7 10 4.5 7.5 3.2M19 10.5C20 7 22 4.5 24.5 3.2" fill="none" stroke="var(--roki)" strokeWidth="2.2" strokeLinecap="round" />
    <ellipse cx="16" cy="19.5" rx="10" ry="10.5" fill="var(--roki)" />
    <polyline points="9.5,23.5 13.5,19.5 16.5,21.5 21.5,15" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="21.8" cy="14.7" r="2.2" fill="var(--sun)" />
  </svg>
);

export const RokiWordmark = ({ className = "" }: { className?: string }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <RokiMark className="w-8 h-8" />
    <span className="text-[20px] leading-none font-semibold tracking-tight text-ink">roki</span>
  </span>
);
