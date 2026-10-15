import { execSync } from "node:child_process";

export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://str1k3:str1k3@localhost:5432/str1k3_e2e_test?schema=public";
  if (!/test/.test(url)) throw new Error("E2E_DATABASE_URL must point at a database whose name contains 'test'.");
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" as const };
  execSync(`npx prisma db execute --url "${url}" --stdin`, { env, input: "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" });
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed-demo.ts", { env, stdio: "inherit" });
}
