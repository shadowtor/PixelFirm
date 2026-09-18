CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
