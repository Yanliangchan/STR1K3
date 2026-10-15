"use client";

import { undoStatementAction } from "@/app/actions/data";
import { useToast } from "@/components/ui/toast";
import type { UndoRef } from "@/server/services/statements";

/** Show a success toast with an Undo button for a statement change. */
export function useUndoToast() {
  const toast = useToast();
  return (message: string, statementId: string, ref: UndoRef | undefined) => {
    if (!ref) return toast("success", message);
    toast("success", message, {
      label: "Undo",
      onClick: async () => {
        try {
          const res = await undoStatementAction({ statementId, ref });
          if (res.ok) toast("success", "Undone.");
          else toast("error", res.error);
        } catch {
          toast("error", "Could not reach the server. Nothing was undone.");
        }
      },
    });
  };
}
