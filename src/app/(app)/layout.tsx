import { AppShell } from "@/components/shell/app-shell";
import { LaunchSplash } from "@/components/shell/animated-logo";
import { requireSession } from "@/server/auth/current";
import { getActiveBatch } from "@/server/services/batches";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const active = await getActiveBatch();
  return (
    <>
      <LaunchSplash />
      <AppShell activeBatchName={active?.name ?? null} userName={session.user.name}>
        {children}
      </AppShell>
    </>
  );
}
