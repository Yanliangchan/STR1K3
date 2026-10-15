import { AppShell } from "@/components/shell/app-shell";
import { LaunchSplash } from "@/components/shell/animated-logo";
import { requireSession } from "@/server/auth/current";
import { getActiveBatch } from "@/server/services/batches";
import { actionNeededCount } from "@/server/services/statements";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const active = await getActiveBatch();
  // Re-computed whenever an action revalidates the layout, so the badge stays current.
  const badge = active ? await actionNeededCount(active.id) : 0;
  return (
    <>
      <LaunchSplash />
      <AppShell activeBatchName={active?.name ?? null} userName={session.user.name} statementsBadge={badge}>
        {children}
      </AppShell>
    </>
  );
}
