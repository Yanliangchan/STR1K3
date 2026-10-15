"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatedLogo } from "./animated-logo";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 70;
const MAX = 110;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Pull down from the top of the page to reload the latest data.
 * Only active in the installed app — browsers already have their own.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const pullRef = useRef(0);

  useEffect(() => {
    if (!isStandalone()) return;
    setEnabled(true);
    document.documentElement.style.overscrollBehaviorY = "contain";

    let startY: number | null = null;
    const set = (v: number) => {
      if ((pullRef.current >= THRESHOLD) !== (v >= THRESHOLD) && v > pullRef.current) haptic("tap");
      pullRef.current = v;
      setPull(v);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      // Don't hijack pulls inside dialogs or scrollable panels.
      if (window.scrollY > 0 || e.touches.length !== 1 || t?.closest("[role=dialog],[data-no-ptr]")) {
        startY = null;
        return;
      }
      startY = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = (e.touches[0]?.clientY ?? startY) - startY;
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0);
        return;
      }
      // Resistance so it feels like a stretch rather than a drag.
      set(Math.min(MAX, dy * 0.5));
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      const fire = pullRef.current >= THRESHOLD;
      set(0);
      if (fire) startTransition(() => router.refresh());
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      document.documentElement.style.overscrollBehaviorY = "";
    };
  }, [router]);

  if (!enabled || (!pull && !pending)) return null;
  const offset = pending ? THRESHOLD * 0.6 : pull * 0.6;
  const ready = pull >= THRESHOLD;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-40 flex justify-center"
      style={{ transform: `translateY(${offset - 24}px)`, opacity: pending ? 1 : Math.min(1, pull / THRESHOLD) }}
      role="status"
      aria-live="polite"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-surface shadow-md">
        <AnimatedLogo className="h-7 w-7" mode={pending || ready ? "busy" : "static"} />
      </div>
      <span className="sr-only">{pending ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
  );
}
