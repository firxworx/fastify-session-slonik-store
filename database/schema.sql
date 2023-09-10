CREATE TABLE IF NOT EXISTS "public"."session" (
  "id" bigint GENERATED ALWAYS AS IDENTITY,
  "sid" varchar NOT NULL,
  "expires_at" timestamptz,
  "data" jsonb NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT "pk__session" PRIMARY KEY ("id"),
  CONSTRAINT "ux__session__sid" UNIQUE("sid")
);

CREATE INDEX "ix__session__expires_at" ON "public"."session" ("expires_at");

CREATE TRIGGER session__upd_before__updated_at_timestamp
BEFORE UPDATE ON "public"."session"
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
