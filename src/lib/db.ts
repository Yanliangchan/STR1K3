import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Small connection pool: this app serves a handful of instructors, and every
 * idle Postgres connection costs memory on both sides. Override with
 * DATABASE_POOL_SIZE, or put connection_limit in DATABASE_URL yourself.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const size = Number.parseInt(process.env.DATABASE_POOL_SIZE ?? "", 10) || 5;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${size}&pool_timeout=20`;
}

function create() {
  // STR1K3_LOG_QUERIES=1 logs every SQL query (for profiling only; off by default).
  if (process.env.STR1K3_LOG_QUERIES === "1") {
    const client = new PrismaClient({ datasourceUrl: datasourceUrl(), log: [{ emit: "event", level: "query" }, "error"] });
    client.$on("query", (e) => console.log(`[query] ${e.duration}ms ${e.query.slice(0, 120)}`));
    return client;
  }
  return new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
