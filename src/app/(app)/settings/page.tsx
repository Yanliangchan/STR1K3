import { requireSession } from "@/server/auth/current";
import { listCategories } from "@/server/services/categories";
import { getRecurringConfig } from "@/server/services/recurring";
import { listUsers } from "@/server/services/users";
import { PageHeader, SectionTitle } from "@/components/ui/misc";
import { CategoriesForm, RecurringForm, UsersForm } from "@/components/settings/settings-forms";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const actor = { id: session.user.id, name: session.user.name, isAdmin: session.user.isAdmin };
  const [categories, recurring, users] = await Promise.all([
    listCategories({ includeInactive: true }),
    getRecurringConfig(),
    actor.isAdmin ? listUsers(actor) : Promise.resolve(null),
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" />
      <section>
        <SectionTitle>Record categories</SectionTitle>
        <CategoriesForm categories={categories.map((c) => ({ id: c.id, name: c.name, recordType: c.recordType, active: c.active }))} />
      </section>
      <section>
        <SectionTitle>Review flags</SectionTitle>
        <RecurringForm {...recurring} />
      </section>
      <section>
        <SectionTitle>Instructor accounts</SectionTitle>
        {users ? (
          <UsersForm
            currentUserId={actor.id}
            users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, isAdmin: u.isAdmin, active: u.active, lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never" }))}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Only administrators can manage instructor accounts.</p>
        )}
      </section>
    </div>
  );
}
