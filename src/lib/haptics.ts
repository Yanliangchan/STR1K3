"use client";

/**
 * Light haptic feedback where supported (Android browsers / installed app).
 * iPhones ignore this: Safari does not expose vibration to web apps.
 */
const PATTERNS = { tap: 8, success: 18, warning: [30, 60, 30] } as const;

export function haptic(kind: keyof typeof PATTERNS) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {}
}
