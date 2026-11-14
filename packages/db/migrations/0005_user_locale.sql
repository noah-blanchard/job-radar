-- Interface language per account (null = follow the browser). Plain text, not an enum: a new
-- language needs no migration, the web validates the value when it reads it.
ALTER TABLE "users" ADD COLUMN "locale" text;