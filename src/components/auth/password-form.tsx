"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";

export function PasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await changePasswordAction(v);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setErrors(res.fieldErrors ?? {});
      return;
    }
    setError(null);
    setErrors({});
    setV({ current: "", next: "", confirm: "" });
    toast("success", "Password changed. Other devices have been signed out.");
    if (redirectTo) router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Current password" required error={errors.current}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />}
      </Field>
      <Field label="New password" required error={errors.next} hint="At least 10 characters.">
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />}
      </Field>
      <Field label="Confirm new password" required error={errors.confirm}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />}
      </Field>
      <Button type="submit" loading={pending}>
        Change password
      </Button>
    </form>
  );
}
