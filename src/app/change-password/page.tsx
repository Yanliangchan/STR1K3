import { PasswordForm } from "@/components/auth/password-form";
import { Logo } from "@/components/shell/logo";
import { requireSession } from "@/server/auth/current";
import { logoutAction } from "@/app/actions/auth";

export const metadata = { title: "Change password" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await requireSession({ allowPasswordChange: true });
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-3 text-xl font-semibold text-navy-900">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-600">
            {session.user.mustChangePassword
              ? "Your password was set by an administrator. Choose your own password to continue."
              : "Change your password."}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <PasswordForm redirectTo="/" />
        </div>
        <form action={logoutAction} className="mt-4 text-center">
          <button className="min-h-11 text-sm text-slate-600 underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}
