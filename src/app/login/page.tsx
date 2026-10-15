import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/shell/logo";
import { getSession } from "@/server/auth/current";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getSession()) redirect("/");
  const notice = sp.expired ? "Your session has ended. Sign in again to continue." : sp.signedout ? "You have been signed out." : undefined;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-3 text-2xl font-bold tracking-[0.2em] text-navy-900">STR1K3</h1>
          <p className="mt-1 text-sm text-slate-600">Instructor records — NORs, CROWs and statements</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
          <LoginForm next={sp.next} notice={notice} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Authorised instructors only. Activity is recorded.</p>
      </div>
    </div>
  );
}
