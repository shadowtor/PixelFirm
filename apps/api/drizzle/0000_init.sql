CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"version" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"company_id" text NOT NULL,
	"floor_id" text,
	"project_id" text,
	"task_id" text,
	"source_agent_id" text,
	"destination_agent_id" text,
	"visibility" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
