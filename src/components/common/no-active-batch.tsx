import Link from "next/link";
import { FolderCog } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";

export function NoActiveBatch() {
  return (
    <EmptyState
      icon={<FolderCog className="h-10 w-10" />}
      title="No active batch has been set"
      action={
        <Link href="/batches" className={buttonClasses("primary")}>
          Go to batch management
        </Link>
      }
    >
      Create a batch (or choose an existing one) and set it as the active batch. STR1K3 will then open straight into it.
    </EmptyState>
  );
}
