"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastAction = { label: string; onClick: () => void | Promise<void> };
type Toast = { id: number; tone: "success" | "error"; message: string; action?: ToastAction };
const Ctx = createContext<(tone: Toast["tone"], message: string, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string, action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 10000 : tone === "error" ? 8000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-lg px-3 py-3 text-sm text-white shadow-lg",
              t.tone === "success" ? "bg-primary-strong" : "bg-danger",
            )}
          >
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="-my-1 min-h-9 rounded-md bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
                onClick={() => {
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                  void t.action!.onClick();
                }}
                data-testid="toast-undo"
              >
                {t.action.label}
              </button>
            )}
            <button className="-m-1 p-1 opacity-80 hover:opacity-100" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
