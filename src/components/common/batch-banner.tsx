import Link from "next/link";
import { Archive, History } from "lucide-react";
import type { BatchContext } from "@/server/context";

/** Shown when a page is displaying a batch other than the active batch. */
export function BatchBanner({ ctx }: { ctx: BatchContext }) {
  if (ctx.isActive && !ctx.readOnly) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
      {ctx.readOnly ? <Archive className="h-4 w-4" aria-hidden /> : <History className="h-4 w-4" aria-hidden />}
      <span className="flex-1">
        Viewing <strong>{ctx.batch.name}</strong>
        {ctx.readOnly ? " (archived, read-only)" : " (not the active batch)"}.
      </span>
      {!ctx.isActive && ctx.activeBatch && (
        <Link href="?" className="font-medium underline">
          Back to {ctx.activeBatch.name}
        </Link>
      )}
    </div>
  );
}
