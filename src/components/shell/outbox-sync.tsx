"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { createEntriesAction } from "@/app/actions/data";
import { useToast } from "@/components/ui/toast";
import { OUTBOX_EVENT, markOutboxError, readOutbox, removeFromOutbox, type OutboxItem } from "@/lib/outbox";

/** Sends records saved offline as soon as the connection is back, and shows connection status. */
export function OutboxSync() {
  const toast = useToast();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const sending = useRef(false);

  const refresh = useCallback(() => setItems(readOutbox()), []);

  const flush = useCallback(async () => {
    if (sending.current || !navigator.onLine) return;
    const pending = readOutbox().filter((i) => !i.error);
    if (!pending.length) return;
    sending.current = true;
    try {
      for (const item of pending) {
        let res;
        try {
          res = await createEntriesAction(item.payload);
        } catch {
          break; // still offline / server unreachable: try again later
        }
        if (res.ok) {
          removeFromOutbox(item.key);
          toast("success", `Sent: ${item.summary}`);
        } else if (res.code === "UNAUTHENTICATED") {
          setNeedsLogin(true);
          break;
        } else if (res.code === "SERVER" || res.code === "RATE_LIMITED") {
          break;
        } else {
          markOutboxError(item.key, res.error);
        }
      }
    } finally {
      sending.current = false;
      refresh();
    }
  }, [refresh, toast]);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      setNeedsLogin(false);
      void flush();
    };
    const down = () => setOnline(false);
    const changed = () => {
      refresh();
      void flush();
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(OUTBOX_EVENT, changed);
    const t = setInterval(() => void flush(), 30_000);
    void flush();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener(OUTBOX_EVENT, changed);
      clearInterval(t);
    };
  }, [flush, refresh]);

  const waiting = items.filter((i) => !i.error);
  const failed = items.filter((i) => i.error);
  if (online && !items.length) return null;

  return (
    <div className="mb-4 space-y-2" role="status" aria-live="polite" data-testid="outbox-banner">
      {!online && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            You&apos;re offline. New NOR, CROW and statement records are saved on this device and sent automatically when you reconnect.
          </span>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-900">
          <span className="flex-1">
            {waiting.length} record {waiting.length === 1 ? "entry" : "entries"} waiting to send: {waiting.map((w) => w.summary).join("; ")}
            {needsLogin && " — sign in again to send."}
          </span>
          {needsLogin ? (
            <a href="/login" target="_blank" rel="noopener" className="font-medium underline">
              Sign in
            </a>
          ) : (
            <button type="button" onClick={() => void flush()} className="inline-flex min-h-9 items-center gap-1 font-medium underline" disabled={!online}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Send now
            </button>
          )}
        </div>
      )}
      {failed.map((f) => (
        <div key={f.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="flex-1">
            Could not save “{f.summary}” (saved offline {new Date(f.savedAt).toLocaleString()}): {f.error}
          </span>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Discard “${f.summary}”? It has not been saved.`)) removeFromOutbox(f.key);
            }}
            className="inline-flex min-h-9 items-center gap-1 font-medium underline"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Discard
          </button>
        </div>
      ))}
    </div>
  );
}
