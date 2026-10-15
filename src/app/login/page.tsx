import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { AnimatedLogo, AnimatedWordmark } from "@/components/shell/animated-logo";
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
          <AnimatedLogo className="h-16 w-16 text-slate-900" />
          <h1 className="mt-2 text-2xl">
            <AnimatedWordmark />
          </h1>
          <p className="tagline-anim mt-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500" data-testid="tagline">
            Standards, Discipline, Digitised
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6">
          <LoginForm next={sp.next} notice={notice} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Authorised instructors only. Activity is recorded.</p>
      </div>
    </div>
  );
}
