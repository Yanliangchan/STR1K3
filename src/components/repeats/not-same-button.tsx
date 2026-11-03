"use client";

import { useState } from "react";
import { dismissRepeatAction, undoDismissRepeatAction } from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** "Not the same offence": hides this suggestion until another matching entry is recorded. */
export function NotSameButton({ batchId, cadetId, term, entryKeys }: { batchId: string; cadetId: string; term: string; entryKeys: string[] }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function dismiss() {
    setPending(true);
    try {
      const res = await dismissRepeatAction({ batchId, cadetId, term, entryKeys });
      if (!res.ok) return toast("error", res.error);
      toast("success", "Hidden. It comes back if a matching entry is recorded.", {
        label: "Undo",
        onClick: async () => {
          const undo = await undoDismissRepeatAction({ dismissalId: res.data }).catch(() => null);
          if (undo?.ok) toast("success", "Undone.");
          else toast("error", undo && !undo.ok ? undo.error : "Could not reach the server. Nothing was undone.");
        },
      });
    } catch {
      toast("error", "Could not reach the server. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={dismiss} data-testid="repeat-not-same">
      Not the same offence
    </Button>
  );
}
