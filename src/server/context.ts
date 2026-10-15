import "server-only";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveBatch } from "./services/batches";

export type BatchContext = {
  batch: { id: string; name: string; status: "OPEN" | "ARCHIVED"; description: string | null };
  isActive: boolean;
  readOnly: boolean;
  /** Set when viewing a batch other than the active one; carried in links as ?b= */
  contextParam: string | null;
  activeBatch: { id: string; name: string } | null;
};

/**
 * Resolve which batch a page shows. Default is the active batch; ?b=<id>
 * explicitly selects another (e.g. historical) batch.
 */
export async function resolveBatchContext(b?: string | string[] | null): Promise<BatchContext | null> {
  const requested = typeof b === "string" && b ? b : null;
  const active = await getActiveBatch();
  if (requested && requested !== active?.id) {
    const batch = await prisma.batch.findUnique({ where: { id: requested } });
    if (!batch) notFound();
    return {
      batch,
      isActive: false,
      readOnly: batch.status !== "OPEN",
      contextParam: batch.id,
      activeBatch: active ? { id: active.id, name: active.name } : null,
    };
  }
  if (!active) return null;
  return {
    batch: active,
    isActive: true,
    readOnly: active.status !== "OPEN",
    contextParam: null,
    activeBatch: { id: active.id, name: active.name },
  };
}

/** Convert service NOT_FOUND errors into the Next.js 404 page. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error && e.name === "AppError" && (e as { code?: string }).code === "NOT_FOUND") notFound();
    throw e;
  }
}
