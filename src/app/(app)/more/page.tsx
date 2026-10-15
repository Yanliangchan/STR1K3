import Link from "next/link";
import { Activity, BarChart3, ChevronRight, Download, FolderCog, LogOut, Settings, UserCircle } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/server/auth/current";
import { Card } from "@/components/ui/misc";

export const metadata = { title: "More" };

const items = [
  { href: "/stats", label: "Statistics", desc: "Charts and recurring-issue flags", Icon: BarChart3 },
  { href: "/batches", label: "Batch management", desc: "Batches, bytes, rosters, archive", Icon: FolderCog },
  { href: "/activity", label: "Activity history", desc: "Audit trail of changes", Icon: Activity },
  { href: "/export", label: "Import / export", desc: "CSV roster import and exports", Icon: Download },
  { href: "/settings", label: "Settings", desc: "Categories, flags, instructors", Icon: Settings },
  { href: "/account", label: "Account", desc: "Password and signed-in devices", Icon: UserCircle },
];

export default async function MorePage() {
  const session = await requireSession();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <Card>
        <ul className="divide-y divide-slate-100">
          {items.map(({ href, label, desc, Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <Icon className="h-5 w-5 text-navy-600" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{label}</p>
                  <p className="text-sm text-slate-500">{desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{session.user.name}</p>
          <p className="truncate text-sm text-slate-500">{session.user.email}</p>
        </div>
        <form action={logoutAction}>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}
