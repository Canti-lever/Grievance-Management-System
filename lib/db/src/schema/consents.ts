import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./grievances";

export const consentsTable = pgTable("gms_consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  service: text("service").notNull(),
  processingActivity: text("processing_activity").notNull(),
  purpose: text("purpose").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  noticeContent: text("notice_content").notNull(),
  consentAccepted: boolean("consent_accepted").notNull().default(true),
  userActivityType: text("user_activity_type").notNull().default("Promotional"),
  sourceOfConsent: text("source_of_consent").notNull().default("Organization"),
  status: text("status").notNull().default("Consented"),
  legacy: text("legacy").notNull().default("Live"),
  digitalPaper: text("digital_paper").notNull().default("Digital"),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  validTill: timestamp("valid_till", { withTimezone: true }),
  paManager: text("pa_manager"),
  template: text("template").notNull(),
  emailStatus: text("email_status"),
  closedOn: timestamp("closed_on", { withTimezone: true }),
  ipAddress: text("ip_address"),
  deviceType: text("device_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConsentSchema = createInsertSchema(consentsTable).omit({ createdAt: true, updatedAt: true });
export type Consent = typeof consentsTable.$inferSelect;
export type InsertConsent = z.infer<typeof insertConsentSchema>;