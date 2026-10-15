// Integration tests always use a dedicated database; never the dev/prod one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://str1k3:str1k3@localhost:5432/str1k3_test?schema=public";
process.env.APP_TIMEZONE = "Asia/Singapore";
process.env.SESSION_IDLE_DAYS = "7";
process.env.SESSION_MAX_DAYS = "30";
