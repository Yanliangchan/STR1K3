export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#142036" style={{ fill: "var(--color-primary-strong)" }} />
      <path d="M14 44 L28 20 L36 34 L42 26 L50 44" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return <span className="font-bold tracking-[0.18em] text-navy-900">STR1K3</span>;
}
