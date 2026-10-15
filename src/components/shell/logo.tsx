/**
 * STR1K3 mark: an outlined record panel with three bars, the top one orange.
 * The outline and lower bars use currentColor so the mark adapts to light/dark.
 */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M14 12 H42 L52 22 V52 H14 Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <rect x="21" y="22" width="22" height="5" fill="#F26B1D" />
      <rect x="21" y="31" width="16" height="5" fill="currentColor" />
      <rect x="21" y="40" width="10" height="5" fill="currentColor" />
    </svg>
  );
}

/** Wordmark with the orange "1". */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-[0.18em] text-slate-900 ${className}`}>
      STR<span className="text-[#F26B1D]">1</span>K3
    </span>
  );
}
