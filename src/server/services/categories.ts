import { z } from "zod";
import type { RecordType } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { invalid, notFound } from "@/server/errors";
import { id, parse, requiredText } from "@/server/validation";

export async function listCategories(opts: { type?: RecordType; includeInactive?: boolean } = {}) {
  return prisma.category.findMany({
    where: { ...(opts.type ? { recordType: opts.type } : {}), ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ recordType: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(actor: Actor, input: { recordType: RecordType; name: string }) {
  const data = parse(z.object({ recordType: z.enum(["NOR", "CROW"]), name: requiredText(60, "Enter a category name.") }), input);
  const clash = await prisma.category.findFirst({
    where: { recordType: data.recordType, name: { equals: data.name, mode: "insensitive" } },
  });
  if (clash) throw invalid("This category already exists.", { name: "Already exists." });
  const max = await prisma.category.aggregate({ where: { recordType: data.recordType }, _max: { sortOrder: true } });
  return prisma.$transaction(async (tx) => {
    const c = await tx.category.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "category.created",
      entityType: "Category",
      entityId: c.id,
      summary: `Added ${c.recordType} category "${c.name}"`,
    });
    return c;
  });
}

export async function updateCategory(actor: Actor, input: { categoryId: string; name: string; active: boolean }) {
  const data = parse(z.object({ categoryId: id, name: requiredText(60, "Enter a category name."), active: z.boolean() }), input);
  const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!cat) throw notFound("Category");
  const clash = await prisma.category.findFirst({
    where: { id: { not: cat.id }, recordType: cat.recordType, name: { equals: data.name, mode: "insensitive" } },
  });
  if (clash) throw invalid("This category already exists.", { name: "Already exists." });
  return prisma.$transaction(async (tx) => {
    const c = await tx.category.update({ where: { id: cat.id }, data: { name: data.name, active: data.active } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "category.updated",
      entityType: "Category",
      entityId: c.id,
      summary: `Updated ${c.recordType} category "${cat.name}"`,
      changes: { name: { from: cat.name, to: c.name }, active: { from: cat.active, to: c.active } },
    });
    return c;
  });
}
