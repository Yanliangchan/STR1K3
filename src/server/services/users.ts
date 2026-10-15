import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { id, parse, requiredText } from "@/server/validation";

function assertAdmin(actor: Actor) {
  if (!actor.isAdmin) throw forbidden("Only an administrator can manage instructor accounts.");
}

export async function listUsers(actor: Actor) {
  assertAdmin(actor);
  return prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, isAdmin: true, active: true, lastLoginAt: true, createdAt: true },
  });
}

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

export async function createUser(
  actor: Actor,
  input: { name: string; email: string; password: string; isAdmin?: boolean },
) {
  assertAdmin(actor);
  const data = parse(
    z.object({ name: requiredText(100, "Enter a name."), email, password: z.string(), isAdmin: z.boolean().default(false) }),
    input,
  );
  const problem = passwordProblem(data.password);
  if (problem) throw invalid(problem, { password: problem });
  if (await prisma.user.findUnique({ where: { email: data.email } })) {
    throw invalid("An account with this email already exists.", { email: "Already in use." });
  }
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { name: data.name, email: data.email, passwordHash, isAdmin: data.isAdmin, mustChangePassword: true },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.created",
      entityType: "User",
      entityId: u.id,
      summary: `Created instructor account for ${u.name}${u.isAdmin ? " (administrator)" : ""}`,
    });
    return u;
  });
}

export async function updateUser(
  actor: Actor,
  input: { userId: string; name: string; isAdmin: boolean; active: boolean },
) {
  assertAdmin(actor);
  const data = parse(
    z.object({ userId: id, name: requiredText(100, "Enter a name."), isAdmin: z.boolean(), active: z.boolean() }),
    input,
  );
  const u = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!u) throw notFound("User");
  if (u.id === actor.id && (!data.isAdmin || !data.active)) {
    throw conflict("You cannot remove your own administrator access or deactivate yourself.");
  }
  if (u.isAdmin && (!data.isAdmin || !data.active)) {
    const admins = await prisma.user.count({ where: { isAdmin: true, active: true } });
    if (admins <= 1) throw conflict("At least one active administrator is required.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { name: data.name, isAdmin: data.isAdmin, active: data.active } });
    if (!data.active) await tx.session.deleteMany({ where: { userId: u.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.updated",
      entityType: "User",
      entityId: u.id,
      summary: `Updated instructor account ${data.name}`,
      changes: {
        name: { from: u.name, to: data.name },
        isAdmin: { from: u.isAdmin, to: data.isAdmin },
        active: { from: u.active, to: data.active },
      },
    });
  });
}

/** Admin sets a temporary password; the instructor must change it at next sign-in. */
export async function resetUserPassword(actor: Actor, input: { userId: string; password: string }) {
  assertAdmin(actor);
  const problem = passwordProblem(input.password ?? "");
  if (problem) throw invalid(problem, { password: problem });
  const u = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!u) throw notFound("User");
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { passwordHash, mustChangePassword: u.id !== actor.id } });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.password_reset",
      entityType: "User",
      entityId: u.id,
      summary: `Reset the password for ${u.name}; their sessions were signed out`,
    });
  });
}

export async function changeOwnPassword(
  actor: Actor,
  currentSessionId: string,
  input: { current: string; next: string; confirm: string },
) {
  const u = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!u) throw notFound("User");
  if (!(await verifyPassword(input.current ?? "", u.passwordHash))) {
    throw invalid("Current password is incorrect.", { current: "Incorrect password." });
  }
  const problem = passwordProblem(input.next ?? "");
  if (problem) throw invalid(problem, { next: problem });
  if (input.next !== input.confirm) throw invalid("Passwords do not match.", { confirm: "Does not match." });
  if (input.next === input.current) throw invalid("Choose a new password.", { next: "Must differ from the current password." });
  const passwordHash = await hashPassword(input.next);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash, mustChangePassword: false } });
  // Sign out every other device; keep the current one.
  await revokeAllSessions(u.id, currentSessionId);
  await writeAudit(prisma, {
    actorId: actor.id,
    action: "user.password_changed",
    entityType: "User",
    entityId: u.id,
    summary: `${u.name} changed their password`,
  });
}

export async function listOwnSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ip: true, expiresAt: true },
  });
}
