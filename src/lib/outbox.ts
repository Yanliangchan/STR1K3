"use client";

import type { CreateEntriesInput } from "@/server/services/entries";

/**
 * Records saved while offline. Each item keeps its idempotency key, so sending
 * it more than once (e.g. after a flaky connection) can never create duplicates.
 * Stored only on this device until sent.
 */
export type OutboxItem = {
  key: string;
  payload: CreateEntriesInput;
  summary: string;
  savedAt: string;
  error?: string;
};

const KEY = "str1k3:outbox";
export const OUTBOX_EVENT = "str1k3:outbox";

export function readOutbox(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxItem[];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function addToOutbox(item: Omit<OutboxItem, "savedAt">) {
  write([...readOutbox().filter((i) => i.key !== item.key), { ...item, savedAt: new Date().toISOString() }]);
}

export function removeFromOutbox(key: string) {
  write(readOutbox().filter((i) => i.key !== key));
}

export function markOutboxError(key: string, error: string) {
  write(readOutbox().map((i) => (i.key === key ? { ...i, error } : i)));
}
