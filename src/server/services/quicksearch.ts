import { prisma } from "@/lib/db";
import { OUTSTANDING_STATUSES } from "@/lib/labels";

export type QuickResult = {
  cadets: { id: string; name: string; byteName: string | null; status: string; outstanding: number }[];
  statements: { id: string; title: string; cadetName: string; status: string }[];
  records: { id: string; type: "NOR" | "CROW"; description: string; cadetName: string }[];
};

/** Instant search across the batch for the command palette. */
export async function quickSearch(batchId: string, q: string): Promise<QuickResult> {
  const query = q.trim().slice(0, 100);
  if (!query) return { cadets: [], statements: [], records: [] };
  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
  const [cadets, statements, records] = await Promise.all([
    prisma.cadet.findMany({
      where: {
        batchId,
        AND: tokens.map((t) => ({
          OR: [{ name: { contains: t, mode: "insensitive" as const } }, { byte: { name: { contains: t, mode: "insensitive" as const } } }],
        })),
      },
      include: {
        byte: true,
        _count: { select: { statements: { where: { voided: false, status: { in: OUTSTANDING_STATUSES } } } } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.statement.findMany({
      where: { batchId, voided: false, title: { contains: query, mode: "insensitive" } },
      include: { cadet: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.record.findMany({
      where: {
        batchId,
        status: "ACTIVE",
        OR: [{ description: { contains: query, mode: "insensitive" } }, { referenceNo: { contains: query, mode: "insensitive" } }],
      },
      include: { cadet: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return {
    cadets: cadets.map((c) => ({ id: c.id, name: c.name, byteName: c.byte?.name ?? null, status: c.status, outstanding: c._count.statements })),
    statements: statements.map((s) => ({ id: s.id, title: s.title, cadetName: s.cadet.name, status: s.status })),
    records: records.map((r) => ({ id: r.id, type: r.type, description: r.description, cadetName: r.cadet.name })),
  };
}

/** Recently used descriptions (with their category) to offer as one-tap quick picks. */
export async function recentDescriptions(batchId: string) {
  const since = new Date(Date.now() - 60 * 86400_000);
  const [records, statements] = await Promise.all([
    prisma.record.groupBy({
      by: ["type", "description", "categoryId"],
      where: { batchId, status: "ACTIVE", createdAt: { gte: since } },
      _count: true,
      _max: { createdAt: true },
    }),
    prisma.statement.groupBy({
      by: ["title"],
      where: { batchId, voided: false, createdAt: { gte: since } },
      _count: true,
      _max: { createdAt: true },
    }),
  ]);
  const rank = <T extends { _count: number; _max: { createdAt: Date | null } }>(a: T, b: T) =>
    b._count - a._count || (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0);
  const pick = (type: "NOR" | "CROW") =>
    records
      .filter((r) => r.type === type && r.description.length <= 120)
      .sort(rank)
      .slice(0, 6)
      .map((r) => ({ description: r.description, categoryId: r.categoryId }));
  return {
    NOR: pick("NOR"),
    CROW: pick("CROW"),
    STATEMENT: statements
      .filter((s) => s.title.length <= 120)
      .sort(rank)
      .slice(0, 6)
      .map((s) => ({ description: s.title, categoryId: null as string | null })),
  };
}
