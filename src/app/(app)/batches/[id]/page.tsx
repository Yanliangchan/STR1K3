import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getArchiveChecklist } from "@/server/services/batches";
import { BatchAdmin } from "@/components/batches/batch-admin";
import { notFound } from "next/navigation";

export const metadata = { title: "Batch" };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await prisma.batch.findUnique({ where: { id } });
  if (!batch) notFound();
  const [bytes, cadets, checklist, others] = await Promise.all([
    prisma.byte.findMany({ where: { batchId: id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { cadets: { where: { status: "ACTIVE" } } } } } }),
    prisma.cadet.findMany({ where: { batchId: id }, include: { byte: true }, orderBy: [{ name: "asc" }] }),
    getArchiveChecklist(id),
    prisma.batch.findMany({
      where: { id: { not: id }, status: "OPEN" },
      include: { bytes: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <div className="space-y-4">
      <Link href="/batches" className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All batches
      </Link>
      <BatchAdmin
        batch={{ id: batch.id, name: batch.name, description: batch.description, expectedSize: batch.expectedSize, status: batch.status, archiveNote: batch.archiveNote }}
        isActive={checklist.isActive}
        bytes={bytes.map((b) => ({ id: b.id, name: b.name, status: b.status, cadetCount: b._count.cadets }))}
        cadets={cadets.map((c) => ({ id: c.id, name: c.name, byteId: c.byteId, byteName: c.byte?.name ?? null, notes: c.notes, status: c.status }))}
        checklist={checklist}
        otherBatches={others.map((b) => ({ id: b.id, name: b.name, bytes: b.bytes.map((x) => ({ id: x.id, name: x.name })) }))}
      />
    </div>
  );
}
