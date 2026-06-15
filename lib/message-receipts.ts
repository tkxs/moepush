import { and, desc, eq, lt, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import {
  messageReceiptDeliveries,
  messageReceipts,
  MessageReceipt,
  MessageReceiptDelivery,
} from "@/lib/db/schema/message-receipts"
import { generateId } from "@/lib/utils"

export type ReceiptSourceType = "endpoint" | "group"
export type ReceiptStatus = "success" | "partial" | "failed"
export type DeliveryStatus = "success" | "failed"

export interface ReceiptSummary {
  total: number
  success: number
  failed: number
  partial: number
}

export interface MessageReceiptListItem {
  id: string
  sourceType: ReceiptSourceType
  sourceId: string
  sourceName: string
  status: ReceiptStatus
  successCount: number
  failedCount: number
  createdAt: string
}

export interface MessageReceiptDeliveryItem {
  id: string
  targetType: "endpoint"
  targetId: string
  targetName: string
  channelId: string
  channelName: string
  channelType: string
  status: DeliveryStatus
  renderedMessage: unknown
  finalPayload: unknown
  responseSummary: unknown
  errorMessage: string | null
  createdAt: string
}

export interface MessageReceiptDetail {
  id: string
  sourceType: ReceiptSourceType
  sourceId: string
  sourceName: string
  requestBody: unknown
  status: ReceiptStatus
  successCount: number
  failedCount: number
  createdAt: string
  deliveries: MessageReceiptDeliveryItem[]
}

export interface MessageReceiptListResponse {
  summary: ReceiptSummary
  records: MessageReceiptListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export interface MessageReceiptDetailResponse {
  record: MessageReceiptDetail
}

interface CreateReceiptInput {
  userId: string
  sourceType: ReceiptSourceType
  sourceId: string
  sourceName: string
  requestBody: unknown
}

interface CreateDeliveryInput {
  receiptId: string
  userId: string
  targetId: string
  targetName: string
  channelId: string
  channelName: string
  channelType: string
  status: DeliveryStatus
  renderedMessage: unknown
  finalPayload: unknown
  responseSummary?: unknown
  errorMessage?: string | null
}

const RETENTION_DAYS = 30

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("no such table") ||
    message.includes("message_receipts") ||
    message.includes("message_receipt_deliveries")
  )
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? {})
}

function parseJson(value: string | null) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toIsoString(value: Date | number | string | null) {
  if (!value) return new Date(0).toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString()
}

function mapReceipt(record: MessageReceipt): MessageReceiptListItem {
  return {
    id: record.id,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceName: record.sourceName,
    status: record.status,
    successCount: record.successCount,
    failedCount: record.failedCount,
    createdAt: toIsoString(record.createdAt),
  }
}

function mapDelivery(record: MessageReceiptDelivery): MessageReceiptDeliveryItem {
  return {
    id: record.id,
    targetType: record.targetType,
    targetId: record.targetId,
    targetName: record.targetName,
    channelId: record.channelId,
    channelName: record.channelName,
    channelType: record.channelType,
    status: record.status,
    renderedMessage: parseJson(record.renderedMessage),
    finalPayload: parseJson(record.finalPayload),
    responseSummary: parseJson(record.responseSummary),
    errorMessage: record.errorMessage,
    createdAt: toIsoString(record.createdAt),
  }
}

export async function cleanupExpiredMessageReceipts() {
  const db = getDb()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  try {
    await db.delete(messageReceipts).where(lt(messageReceipts.createdAt, cutoff))
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn("[MESSAGE_RECEIPTS_CLEANUP] tables not ready yet")
      return
    }
    throw error
  }
}

export async function createMessageReceipt(input: CreateReceiptInput) {
  await cleanupExpiredMessageReceipts()
  const db = getDb()
  const id = generateId()

  await db.insert(messageReceipts).values({
    id,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    requestBody: serializeJson(input.requestBody),
    status: "failed",
    successCount: 0,
    failedCount: 0,
    createdAt: new Date(),
  })

  return id
}

export async function createMessageReceiptDelivery(input: CreateDeliveryInput) {
  const db = getDb()
  await db.insert(messageReceiptDeliveries).values({
    id: generateId(),
    receiptId: input.receiptId,
    userId: input.userId,
    targetType: "endpoint",
    targetId: input.targetId,
    targetName: input.targetName,
    channelId: input.channelId,
    channelName: input.channelName,
    channelType: input.channelType,
    status: input.status,
    renderedMessage: serializeJson(input.renderedMessage),
    finalPayload: serializeJson(input.finalPayload),
    responseSummary: input.responseSummary === undefined ? null : serializeJson(input.responseSummary),
    errorMessage: input.errorMessage ?? null,
    createdAt: new Date(),
  })
}

export async function finalizeMessageReceipt(receiptId: string) {
  const db = getDb()
  const deliveries = await db.query.messageReceiptDeliveries.findMany({
    where: eq(messageReceiptDeliveries.receiptId, receiptId),
  })

  const successCount = deliveries.filter(item => item.status === "success").length
  const failedCount = deliveries.filter(item => item.status === "failed").length

  const status: ReceiptStatus =
    failedCount === 0 ? "success" : successCount === 0 ? "failed" : "partial"

  await db
    .update(messageReceipts)
    .set({
      status,
      successCount,
      failedCount,
    })
    .where(eq(messageReceipts.id, receiptId))

  return { status, successCount, failedCount }
}

export async function getMessageReceipts(params: {
  userId: string
  sourceType: ReceiptSourceType | "all"
  sourceId?: string
  page: number
  pageSize: number
}) : Promise<MessageReceiptListResponse> {
  await cleanupExpiredMessageReceipts()
  const db = getDb()
  const conditions = [eq(messageReceipts.userId, params.userId)]

  if (params.sourceType !== "all") {
    conditions.push(eq(messageReceipts.sourceType, params.sourceType))
  }

  if (params.sourceId) {
    conditions.push(eq(messageReceipts.sourceId, params.sourceId))
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

  try {
    const [records, totalRows, summaryRows] = await Promise.all([
      db.query.messageReceipts.findMany({
        where: whereClause ?? undefined,
        orderBy: [desc(messageReceipts.createdAt)],
        limit: params.pageSize,
        offset: (params.page - 1) * params.pageSize,
      }),
      db.select({ count: sql<number>`count(*)` }).from(messageReceipts).where(whereClause ?? undefined),
      db.select({
        total: sql<number>`count(*)`,
        success: sql<number>`sum(case when ${messageReceipts.status} = 'success' then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${messageReceipts.status} = 'failed' then 1 else 0 end)`,
        partial: sql<number>`sum(case when ${messageReceipts.status} = 'partial' then 1 else 0 end)`,
      }).from(messageReceipts).where(whereClause ?? undefined),
    ])

    const total = totalRows[0]?.count ?? 0
    const summary = summaryRows[0] ?? { total: 0, success: 0, failed: 0, partial: 0 }

    return {
      summary: {
        total: Number(summary.total ?? 0),
        success: Number(summary.success ?? 0),
        failed: Number(summary.failed ?? 0),
        partial: Number(summary.partial ?? 0),
      },
      records: records.map(mapReceipt),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: Number(total),
      },
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn("[MESSAGE_RECEIPTS_GET] tables not ready yet")
      return {
        summary: {
          total: 0,
          success: 0,
          failed: 0,
          partial: 0,
        },
        records: [],
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total: 0,
        },
      }
    }
    throw error
  }
}

export async function getMessageReceiptDetail(params: {
  id: string
  userId: string
}): Promise<MessageReceiptDetailResponse | null> {
  await cleanupExpiredMessageReceipts()
  const db = getDb()
  let record
  try {
    record = await db.query.messageReceipts.findFirst({
      where: and(
        eq(messageReceipts.id, params.id),
        eq(messageReceipts.userId, params.userId)
      ),
    })
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn("[MESSAGE_RECEIPT_DETAIL] tables not ready yet")
      return null
    }
    throw error
  }

  if (!record) return null

  let deliveries: MessageReceiptDelivery[] = []
  try {
    deliveries = await db.query.messageReceiptDeliveries.findMany({
      where: and(
        eq(messageReceiptDeliveries.receiptId, record.id),
        eq(messageReceiptDeliveries.userId, params.userId)
      ),
      orderBy: [desc(messageReceiptDeliveries.createdAt)],
    })
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn("[MESSAGE_RECEIPT_DETAIL_DELIVERIES] tables not ready yet")
      deliveries = []
    } else {
      throw error
    }
  }

  return {
    record: {
      id: record.id,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      sourceName: record.sourceName,
      requestBody: parseJson(record.requestBody),
      status: record.status,
      successCount: record.successCount,
      failedCount: record.failedCount,
      createdAt: toIsoString(record.createdAt),
      deliveries: deliveries.map(mapDelivery),
    },
  }
}
