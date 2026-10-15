"use client";

import { useEffect } from "react";
import { rememberCadet } from "@/components/shell/command-palette";

/** Adds the cadet to "Recently viewed" in the search palette (this device only). */
export function RememberCadet({ id, name, byteName }: { id: string; name: string; byteName: string | null }) {
  useEffect(() => rememberCadet({ id, name, byteName }), [id, name, byteName]);
  return null;
}
