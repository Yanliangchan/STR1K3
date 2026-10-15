import { cn } from "@/lib/utils";

/** The STR1K3 mark with draw-in (mode="intro") or pulsing bars (mode="busy"). */
export function AnimatedLogo({ className = "h-16 w-16", mode = "intro" }: { className?: string; mode?: "intro" | "busy" | "static" }) {
  return (
    <svg viewBox="0 0 64 64" className={cn(mode === "intro" && "logo-anim", mode === "busy" && "logo-busy", className)} aria-hidden>
      <path className="logo-frame" d="M14 12 H42 L52 22 V52 H14 Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <rect className="logo-bar logo-bar-1" x="21" y="22" width="22" height="5" fill="#F26B1D" />
      <rect className="logo-bar logo-bar-2" x="21" y="31" width="16" height="5" fill="currentColor" />
      <rect className="logo-bar logo-bar-3" x="21" y="40" width="10" height="5" fill="currentColor" />
    </svg>
  );
}

/** Wordmark whose letters rise in, with the "1" turning orange last. */
export function AnimatedWordmark({ className = "" }: { className?: string }) {
  const letters = "STR1K3".split("");
  return (
    <span className={cn("wordmark-anim font-extrabold tracking-[0.18em] text-slate-900", className)} aria-label="STR1K3">
      {letters.map((l, i) => (
        <span key={i} aria-hidden className={cn("wm-letter", l === "1" && "wm-one")} style={{ animationDelay: l === "1" ? "0.9s, 1.25s" : `${0.55 + i * 0.06}s` }}>
          {l}
        </span>
      ))}
    </span>
  );
}

/** Brief branded splash on app launch (once per browser session; see layout script). */
export function LaunchSplash() {
  return (
    <div className="splash" aria-hidden data-testid="launch-splash">
      <AnimatedLogo className="h-20 w-20" />
      <AnimatedWordmark className="text-2xl" />
    </div>
  );
}
