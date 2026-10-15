import Link from "@/components/ui/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Not found</p>
      <h1 className="text-xl font-semibold">This page or record does not exist.</h1>
      <Link href="/" className="min-h-11 py-2 text-navy-700 underline">
        Back to the active batch
      </Link>
    </div>
  );
}
