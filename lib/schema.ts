import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

export const prospectStatus = pgEnum("prospect_status", [
  "lead",
  "researched",
  "mock_built",
  "emailed",
  "opened",
  "clicked",
  "replied",
  "meeting",
  "won",
  "lost",
  "ignored",
]);

export const PROSPECT_STATUSES = [
  "lead",
  "researched",
  "mock_built",
  "emailed",
  "opened",
  "clicked",
  "replied",
  "meeting",
  "won",
  "lost",
  "ignored",
] as const;

export const emailDirection = pgEnum("email_direction", ["outbound", "inbound"]);
export const EMAIL_DIRECTIONS = ["outbound", "inbound"] as const;

export const eventType = pgEnum("event_type", [
  "email_sent",
  "email_open",
  "link_click",
  "email_reply",
  "note",
  "status_change",
]);
export const EVENT_TYPES = [
  "email_sent",
  "email_open",
  "link_click",
  "email_reply",
  "note",
  "status_change",
] as const;

export const prospects = pgTable(
  "prospects",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    business: text("business").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    website: text("website"),
    location: text("location"),
    industry: text("industry"),
    status: prospectStatus("status").default("lead").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]),
    notes: text("notes"),
    pitchUrl: text("pitch_url"),
    pitchDeployedAt: timestamp("pitch_deployed_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("prospects_slug_idx").on(t.slug),
    statusIdx: index("prospects_status_idx").on(t.status),
  }),
);

export const emails = pgTable(
  "emails",
  {
    id: serial("id").primaryKey(),
    prospectId: integer("prospect_id")
      .references(() => prospects.id, { onDelete: "cascade" })
      .notNull(),
    direction: emailDirection("direction").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    fromAddr: text("from_addr"),
    toAddr: text("to_addr"),
    gmailMessageId: text("gmail_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    outlookMessageId: text("outlook_message_id"),
    outlookConversationId: text("outlook_conversation_id"),
    internetMessageId: text("internet_message_id"),
    resendMessageId: text("resend_message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    inReplyTo: text("in_reply_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    prospectIdx: index("emails_prospect_idx").on(t.prospectId),
    threadIdx: index("emails_thread_idx").on(t.gmailThreadId),
    msgIdx: uniqueIndex("emails_gmail_msg_idx").on(t.gmailMessageId),
    outlookMsgIdx: uniqueIndex("emails_outlook_msg_idx").on(t.outlookMessageId),
    outlookConvIdx: index("emails_outlook_conv_idx").on(t.outlookConversationId),
  }),
);

export const links = pgTable(
  "links",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 12 }).notNull(),
    emailId: integer("email_id").references(() => emails.id, { onDelete: "set null" }),
    prospectId: integer("prospect_id").references(() => prospects.id, { onDelete: "set null" }),
    target: text("target").notNull(),
    label: text("label"),
    clickCount: integer("click_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("links_code_idx").on(t.code),
    emailIdx: index("links_email_idx").on(t.emailId),
  }),
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    type: eventType("type").notNull(),
    prospectId: integer("prospect_id").references(() => prospects.id, { onDelete: "cascade" }),
    emailId: integer("email_id").references(() => emails.id, { onDelete: "set null" }),
    linkId: integer("link_id").references(() => links.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddr: text("ip_addr"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    prospectIdx: index("events_prospect_idx").on(t.prospectId),
    typeIdx: index("events_type_idx").on(t.type),
    timeIdx: index("events_time_idx").on(t.occurredAt),
  }),
);

export const emailDrafts = pgTable("email_drafts", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id")
    .references(() => prospects.id, { onDelete: "cascade" })
    .notNull(),
  subject: text("subject").default("").notNull(),
  body: text("body").default("").notNull(),
  fromAddr: text("from_addr"),
  toAddr: text("to_addr"),
  inReplyTo: text("in_reply_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  prospectIdx: uniqueIndex("email_drafts_prospect_idx").on(t.prospectId),
}));

export type EmailDraft = typeof emailDrafts.$inferSelect;

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  scope: varchar("scope", { length: 30 }).default("other").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;

export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value"),
  isSecret: boolean("is_secret").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
