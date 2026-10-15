import { LogOut } from "lucide-react";
import { requireSession } from "@/server/auth/current";
import { listOwnSessions } from "@/server/services/users";
import { logoutAction } from "@/app/actions/auth";
import { Card, PageHeader, SectionTitle } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { PasswordForm } from "@/components/auth/password-form";
import { SignOutOthers } from "@/components/settings/sign-out-others";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";

export const metadata = { title: "Account" };

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export default async function AccountPage() {
  const session = await requireSession();
  const sessions = await listOwnSessions(session.user.id);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Account" description={`${session.user.name} · ${session.user.email}`} />
      <section>
        <SectionTitle>Change password</SectionTitle>
        <Card className="p-4">
          <PasswordForm />
        </Card>
      </section>
      <section>
        <SectionTitle>Signed-in devices</SectionTitle>
        <Card>
          <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            You stay signed in on a device for up to {env.sessionMaxDays} days, or until {env.sessionIdleDays} days without use.
          </p>
          <ul className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">
                  {device(s.userAgent)} {s.id === session.sessionId && <Badge tone="green">This device</Badge>}
                </p>
                <p className="text-slate-500">
                  Signed in {formatDateTime(s.createdAt)} · last active {formatDateTime(s.lastSeenAt)}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
            <SignOutOthers disabled={sessions.length <= 1} />
            <form action={logoutAction}>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-red-700 hover:bg-red-50">
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </Card>
      </section>
    </div>
  );
}
