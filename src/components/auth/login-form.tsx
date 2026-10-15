"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {notice && !state?.error && <Alert tone="info">{notice}</Alert>}
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Email" required>
        {(p) => (
          <Input {...p} name="email" type="email" autoComplete="username" inputMode="email" defaultValue={state?.email} required autoFocus />
        )}
      </Field>
      <Field label="Password" required>
        {(p) => (
          <div className="relative">
            <Input {...p} name="password" type={show ? "text" : "password"} autoComplete="current-password" className="pr-12" required />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        )}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Forgotten your password? Ask a STR1K3 administrator to reset it.
      </p>
    </form>
  );
}
