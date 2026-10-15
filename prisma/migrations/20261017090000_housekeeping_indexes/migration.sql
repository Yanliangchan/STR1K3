-- Indexes so periodic cleanup of expired sessions and old sign-in attempts is cheap.
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_lastSeenAt_idx" ON "Session"("lastSeenAt");
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");
