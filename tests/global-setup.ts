import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://str1k3:str1k3@localhost:5432/str1k3_test?schema=public";
  if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'.");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
