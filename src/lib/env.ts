function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  get timezone() {
    return process.env.APP_TIMEZONE || "Asia/Singapore";
  },
  get sessionIdleDays() {
    return intEnv("SESSION_IDLE_DAYS", 7);
  },
  get sessionMaxDays() {
    return intEnv("SESSION_MAX_DAYS", 30);
  },
  get cookieSecure() {
    return process.env.COOKIE_SECURE !== "false";
  },
};
