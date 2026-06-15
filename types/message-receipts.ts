export type ReceiptSourceType = "endpoint" | "group"
export type ReceiptStatus = "success" | "partial" | "failed"
export type DeliveryStatus = "success" | "failed"

export interface MessageReceiptSummary {
  total: number
  success: number
  failed: number
  partial: number
}

export interface MessageReceipt {
  id: string
  sourceType: ReceiptSourceType
  sourceId: string
  sourceName: string
  status: ReceiptStatus
  successCount: number
  failedCount: number
  createdAt: string
}

export interface MessageReceiptDelivery {
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

export interface MessageReceiptListResponse {
  summary: MessageReceiptSummary
  records: MessageReceipt[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export interface MessageReceiptDetailResponse {
  record: MessageReceipt & {
    requestBody: unknown
    deliveries: MessageReceiptDelivery[]
  }
}
