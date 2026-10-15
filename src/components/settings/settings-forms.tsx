"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import {
  createCategoryAction,
  createUserAction,
  resetUserPasswordAction,
  updateCategoryAction,
  updateRecurringAction,
  updateUserAction,
} from "@/app/actions/data";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badges";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/action";

function useRun() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<ActionResult<unknown>>, ok: string) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return false;
      }
      setFieldErrors({});
      toast("success", ok);
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server. Nothing was changed.");
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, fieldErrors };
}

type Cat = { id: string; name: string; recordType: "NOR" | "CROW"; active: boolean };

export function CategoriesForm({ categories }: { categories: Cat[] }) {
  const { run, pending, error, fieldErrors } = useRun();
  const [v, setV] = useState<{ recordType: "NOR" | "CROW"; name: string }>({ recordType: "NOR", name: "" });
  return (
    <Card>
      {error && (
        <div className="p-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {(["NOR", "CROW"] as const).map((t) => {
          const list = categories.filter((c) => c.recordType === t);
          return (
            <div key={t}>
              <p className="mb-2 text-sm font-semibold text-slate-800">{t} categories</p>
              {list.length === 0 ? (
                <p className="text-sm text-slate-500">None yet.</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((c) => (
                    <CategoryRow key={c.id} c={c} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-[120px_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => createCategoryAction(v), "Category added.")) setV({ ...v, name: "" });
        }}
      >
        <Select value={v.recordType} onChange={(e) => setV({ ...v, recordType: e.target.value as "NOR" | "CROW" })} aria-label="Record type">
          <option value="NOR">NOR</option>
          <option value="CROW">CROW</option>
        </Select>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Category name" aria-label="Category name" aria-invalid={!!fieldErrors.name} maxLength={60} />
        <Button type="submit" variant="secondary" loading={pending} disabled={!v.name.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </form>
    </Card>
  );
}

function CategoryRow({ c }: { c: Cat }) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  return (
    <li className="flex items-center gap-2 text-sm">
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" className="min-h-9" />
          <Button size="sm" loading={pending} onClick={async () => (await run(() => updateCategoryAction({ categoryId: c.id, name, active: c.active }), "Category renamed.")) && setEditing(false)}>
            Save
          </Button>
        </>
      ) : (
        <>
          <span className={c.active ? "flex-1" : "flex-1 text-slate-400 line-through"}>{c.name}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => updateCategoryAction({ categoryId: c.id, name: c.name, active: !c.active }), c.active ? "Category hidden from new records." : "Category re-enabled.")}>
            {c.active ? "Disable" : "Enable"}
          </Button>
        </>
      )}
    </li>
  );
}

export function RecurringForm({ threshold, windowDays }: { threshold: number; windowDays: number | null }) {
  const { run, pending, error, fieldErrors } = useRun();
  const [t, setT] = useState(String(threshold));
  const [w, setW] = useState(windowDays ? String(windowDays) : "");
  return (
    <Card className="space-y-3 p-4">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm text-slate-600">
        A cadet is flagged for review when they have this many distinct occurrences in the same NOR/CROW category. This is a
        local review aid, not an official rule, and never creates records or triggers action.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distinct occurrences" error={fieldErrors.threshold}>
          {(p) => <Input {...p} type="number" min={2} value={t} onChange={(e) => setT(e.target.value)} />}
        </Field>
        <Field label="Within (days)" hint="Blank = whole batch" error={fieldErrors.windowDays}>
          {(p) => <Input {...p} type="number" min={1} value={w} onChange={(e) => setW(e.target.value)} />}
        </Field>
      </div>
      <Button loading={pending} onClick={() => run(() => updateRecurringAction({ threshold: Number(t), windowDays: w ? Number(w) : null }), "Recurring-issue settings saved.")}>
        Save
      </Button>
    </Card>
  );
}

type U = { id: string; name: string; email: string; isAdmin: boolean; active: boolean; lastLogin: string };

export function UsersForm({ users, currentUserId }: { users: U[]; currentUserId: string }) {
  const { run, pending, error, fieldErrors } = useRun();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", email: "", password: "", isAdmin: false });
  const [reset, setReset] = useState<U | null>(null);
  const [pw, setPw] = useState("");
  return (
    <Card>
      {error && !open && !reset && (
        <div className="p-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                {u.name}
                {u.isAdmin && <Badge tone="navy">Admin</Badge>}
                {!u.active && <Badge tone="red">Deactivated</Badge>}
                {u.id === currentUserId && <Badge>You</Badge>}
              </p>
              <p className="text-sm text-slate-500">
                {u.email} · last sign-in {u.lastLogin}
              </p>
            </div>
            {u.id !== currentUserId && (
              <>
                <Button size="sm" variant="ghost" onClick={() => run(() => updateUserAction({ userId: u.id, name: u.name, isAdmin: !u.isAdmin, active: u.active }), "Account updated.")}>
                  {u.isAdmin ? "Remove admin" : "Make admin"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => updateUserAction({ userId: u.id, name: u.name, isAdmin: u.isAdmin, active: !u.active }), u.active ? "Account deactivated and signed out." : "Account reactivated.")}>
                  {u.active ? "Deactivate" : "Reactivate"}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => (setReset(u), setPw(""))}>
              <KeyRound className="h-4 w-4" aria-hidden /> Reset password
            </Button>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 p-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add instructor
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add instructor"
        description="They will be asked to choose their own password at first sign-in."
        footer={
          <Button
            loading={pending}
            onClick={async () => {
              if (await run(() => createUserAction(v), "Instructor account created.")) {
                setOpen(false);
                setV({ name: "", email: "", password: "", isAdmin: false });
              }
            }}
          >
            Create account
          </Button>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Name" required error={fieldErrors.name}>
            {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
          </Field>
          <Field label="Email" required error={fieldErrors.email}>
            {(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}
          </Field>
          <Field label="Temporary password" required hint="At least 10 characters. Share it securely." error={fieldErrors.password}>
            {(p) => <Input {...p} type="text" autoComplete="off" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />}
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox checked={v.isAdmin} onChange={(e) => setV({ ...v, isAdmin: e.target.checked })} /> Administrator (can manage instructor accounts)
          </label>
        </div>
      </Dialog>

      <Dialog
        open={!!reset}
        onOpenChange={(o) => !o && setReset(null)}
        title={`Reset password for ${reset?.name ?? ""}`}
        description="All of their sessions will be signed out. They must choose a new password at next sign-in."
        footer={
          <Button loading={pending} onClick={async () => reset && (await run(() => resetUserPasswordAction({ userId: reset.id, password: pw }), "Password reset.")) && setReset(null)}>
            Reset password
          </Button>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Temporary password" hint="At least 10 characters." error={fieldErrors.password}>
            {(p) => <Input {...p} type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />}
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}
