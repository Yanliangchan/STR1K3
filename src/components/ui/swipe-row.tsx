"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * Swipe right to run the row's primary action. Vertical scrolling still works,
 * taps still work, and the same action is always available as a button.
 */
export function SwipeRow({
  enabled,
  label,
  tone = "navy",
  onCommit,
  children,
  className,
}: {
  enabled: boolean;
  label: string;
  tone?: "navy" | "green";
  onCommit: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const [dx, setDxState] = useState(0);
  const dxRef = useRef(0);
  const setDx = (v: number) => {
    dxRef.current = v;
    setDxState(v);
  };
  const [busy, setBusy] = useState(false);

  const width = () => ref.current?.offsetWidth ?? 320;
  const threshold = () => Math.min(140, width() * 0.35);

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled || busy || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging.current = false;
    moved.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!dragging.current) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        start.current = null; // vertical scroll wins
        return;
      }
      if (mx > 12 && mx > Math.abs(my) * 1.5) {
        dragging.current = true;
        moved.current = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
      } else return;
    }
    const next = Math.max(0, Math.min(mx, width() * 0.8));
    // Tick once when the swipe crosses the "release to act" point.
    if ((dxRef.current >= threshold()) !== (next >= threshold())) haptic("tap");
    setDx(next);
  }
  async function end() {
    const commit = dragging.current && dxRef.current >= threshold();
    start.current = null;
    dragging.current = false;
    if (!commit) {
      setDx(0);
      return;
    }
    setBusy(true);
    setDx(width());
    try {
      await onCommit();
    } finally {
      setBusy(false);
      setDx(0);
    }
  }

  const armed = dx >= threshold();
  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      {enabled && dx > 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center pl-5 text-sm font-semibold text-white transition-colors",
            armed ? (tone === "green" ? "bg-emerald-600" : "bg-primary") : "bg-slate-400",
          )}
        >
          {armed ? `Release: ${label}` : `→ ${label}`}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={() => {
          start.current = null;
          dragging.current = false;
          setDx(0);
        }}
        onClickCapture={(e) => {
          // A swipe must never also open the row.
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={cn("relative bg-surface", !dragging.current && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
