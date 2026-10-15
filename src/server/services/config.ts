import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * App configuration (active batch + thresholds), loaded once per page render.
 * Outside a React server render (tests, scripts) this is not memoised, so it
 * always reads fresh. Write paths read the config inside their transaction.
 */
export const getAppConfig = cache(() =>
  prisma.appConfig.findUnique({ where: { id: 1 }, include: { activeBatch: true } }),
);
