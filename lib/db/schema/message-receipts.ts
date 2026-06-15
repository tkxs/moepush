import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"
import { users } from "./auth"

export const messageReceipts = sqliteTable("message_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sourceType: text("source_type", { enum: ["endpoint", "group"] }).notNull(),
  sourceId: text("source_id").notNull(),
  sourceName: text("source_name").notNull(),
  requestBody: text("request_body").notNull(),
  status: text("status", { enum: ["success", "partial", "failed"] }).notNull(),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  userIdIdx: index("message_receipts_user_id_idx").on(table.userId),
  sourceTypeIdx: index("message_receipts_source_type_idx").on(table.sourceType),
  sourceIdIdx: index("message_receipts_source_id_idx").on(table.sourceId),
  createdAtIdx: index("message_receipts_created_at_idx").on(table.createdAt),
}))

export const messageReceiptDeliveries = sqliteTable("message_receipt_deliveries", {
  id: text("id").primaryKey(),
  receiptId: text("receipt_id").notNull().references(() => messageReceipts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["endpoint"] }).notNull().default("endpoint"),
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  channelType: text("channel_type").notNull(),
  status: text("status", { enum: ["success", "failed"] }).notNull(),
  renderedMessage: text("rendered_message").notNull(),
  finalPayload: text("final_payload").notNull(),
  responseSummary: text("response_summary"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  receiptIdIdx: index("message_receipt_deliveries_receipt_id_idx").on(table.receiptId),
  userIdIdx: index("message_receipt_deliveries_user_id_idx").on(table.userId),
  targetIdIdx: index("message_receipt_deliveries_target_id_idx").on(table.targetId),
  createdAtIdx: index("message_receipt_deliveries_created_at_idx").on(table.createdAt),
}))

export const messageReceiptsRelations = relations(messageReceipts, ({ many, one }) => ({
  deliveries: many(messageReceiptDeliveries),
  user: one(users, {
    fields: [messageReceipts.userId],
    references: [users.id],
  })
}))

export const messageReceiptDeliveriesRelations = relations(messageReceiptDeliveries, ({ one }) => ({
  receipt: one(messageReceipts, {
    fields: [messageReceiptDeliveries.receiptId],
    references: [messageReceipts.id],
  }),
  user: one(users, {
    fields: [messageReceiptDeliveries.userId],
    references: [users.id],
  })
}))

export type MessageReceipt = typeof messageReceipts.$inferSelect
export type NewMessageReceipt = typeof messageReceipts.$inferInsert
export type MessageReceiptDelivery = typeof messageReceiptDeliveries.$inferSelect
export type NewMessageReceiptDelivery = typeof messageReceiptDeliveries.$inferInsert
