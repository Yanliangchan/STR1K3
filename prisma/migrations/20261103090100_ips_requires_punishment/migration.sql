-- An IPS always states the punishment given; other record types never carry one.
-- (Separate migration: a new enum value can't be used in the transaction that adds it.)
ALTER TABLE "Record" ADD CONSTRAINT "Record_ips_punishment_check"
  CHECK (("type" = 'IPS') = ("punishment" IS NOT NULL));
