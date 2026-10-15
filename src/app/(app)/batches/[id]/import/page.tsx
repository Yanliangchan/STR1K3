import Link from "@/components/ui/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { Alert, PageHeader } from "@/components/ui/misc";
import { ImportForm } from "@/components/batches/import-form";

export const metadata = { title: "Import roster" };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await prisma.batch.findUnique({ where: { id } });
  if (!batch) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/batches/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {batch.name}
      </Link>
      <PageHeader title="Import roster from CSV" description={`Cadets will be added to ${batch.name}.`} />
      {batch.status === "ARCHIVED" ? <Alert tone="warning">This batch is archived and read-only.</Alert> : <ImportForm batchId={batch.id} batchName={batch.name} />}
    </div>
  );
}
