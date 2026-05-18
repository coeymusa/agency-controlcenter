// Idempotent Postgres DDL. Safe to run on every boot.
// Mirrors lib/schema.ts.

export const SCHEMA_SQL = `
DO $$ BEGIN
  CREATE TYPE "prospect_status" AS ENUM ('lead','researched','mock_built','emailed','opened','clicked','replied','meeting','won','lost','ignored');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "email_direction" AS ENUM ('outbound','inbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "event_type" AS ENUM ('email_sent','email_open','link_click','email_reply','note','status_change');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "prospects" (
  "id" serial PRIMARY KEY,
  "slug" varchar(120) NOT NULL,
  "business" text NOT NULL,
  "contact_name" text,
  "contact_email" text,
  "website" text,
  "location" text,
  "industry" text,
  "status" "prospect_status" DEFAULT 'lead' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "notes" text,
  "pitch_url" text,
  "pitch_deployed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_slug_idx" ON "prospects" ("slug");
CREATE INDEX IF NOT EXISTS "prospects_status_idx" ON "prospects" ("status");
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "snoozed_until" timestamp with time zone;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "pitch_issues" text;
CREATE INDEX IF NOT EXISTS "prospects_snoozed_idx" ON "prospects" ("snoozed_until");

CREATE TABLE IF NOT EXISTS "emails" (
  "id" serial PRIMARY KEY,
  "prospect_id" integer NOT NULL REFERENCES "prospects"("id") ON DELETE CASCADE,
  "direction" "email_direction" NOT NULL,
  "subject" text NOT NULL,
  "body_text" text,
  "body_html" text,
  "from_addr" text,
  "to_addr" text,
  "gmail_message_id" text,
  "gmail_thread_id" text,
  "outlook_message_id" text,
  "outlook_conversation_id" text,
  "internet_message_id" text,
  "resend_message_id" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "emails_prospect_idx" ON "emails" ("prospect_id");
CREATE INDEX IF NOT EXISTS "emails_thread_idx" ON "emails" ("gmail_thread_id");
CREATE UNIQUE INDEX IF NOT EXISTS "emails_gmail_msg_idx" ON "emails" ("gmail_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "emails_outlook_msg_idx" ON "emails" ("outlook_message_id");
CREATE INDEX IF NOT EXISTS "emails_outlook_conv_idx" ON "emails" ("outlook_conversation_id");

ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "resend_message_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "emails_resend_msg_idx" ON "emails" ("resend_message_id");
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "in_reply_to" text;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "emails_scheduled_idx" ON "emails" ("scheduled_for");
CREATE INDEX IF NOT EXISTS "emails_read_at_idx" ON "emails" ("read_at");
CREATE INDEX IF NOT EXISTS "emails_archived_at_idx" ON "emails" ("archived_at");

CREATE TABLE IF NOT EXISTS "links" (
  "id" serial PRIMARY KEY,
  "code" varchar(12) NOT NULL,
  "email_id" integer REFERENCES "emails"("id") ON DELETE SET NULL,
  "prospect_id" integer REFERENCES "prospects"("id") ON DELETE SET NULL,
  "target" text NOT NULL,
  "label" text,
  "click_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "links_code_idx" ON "links" ("code");
CREATE INDEX IF NOT EXISTS "links_email_idx" ON "links" ("email_id");

CREATE TABLE IF NOT EXISTS "events" (
  "id" serial PRIMARY KEY,
  "type" "event_type" NOT NULL,
  "prospect_id" integer REFERENCES "prospects"("id") ON DELETE CASCADE,
  "email_id" integer REFERENCES "emails"("id") ON DELETE SET NULL,
  "link_id" integer REFERENCES "links"("id") ON DELETE SET NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_addr" text,
  "user_agent" text,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "events_prospect_idx" ON "events" ("prospect_id");
CREATE INDEX IF NOT EXISTS "events_type_idx" ON "events" ("type");
CREATE INDEX IF NOT EXISTS "events_time_idx" ON "events" ("occurred_at");

CREATE TABLE IF NOT EXISTS "email_drafts" (
  "id" serial PRIMARY KEY,
  "prospect_id" integer NOT NULL REFERENCES "prospects"("id") ON DELETE CASCADE,
  "subject" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "from_addr" text,
  "to_addr" text,
  "in_reply_to" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_drafts_prospect_idx" ON "email_drafts" ("prospect_id");

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" serial PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "scope" varchar(30) DEFAULT 'other' NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings" (
  "key" varchar(80) PRIMARY KEY,
  "value" text,
  "is_secret" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;
