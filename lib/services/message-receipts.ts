import { MessageReceiptDetailResponse, MessageReceiptListResponse, ReceiptSourceType } from "@/types/message-receipts"

export async function getMessageReceiptList(params: {
  sourceType: ReceiptSourceType | "all"
  page?: number
  pageSize?: number
}) {
  const searchParams = new URLSearchParams({
    sourceType: params.sourceType,
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 10),
  })

  const response = await fetch(`/api/message-receipts?${searchParams.toString()}`)
  if (!response.ok) {
    throw new Error("加载接收消息记录失败")
  }

  return response.json() as Promise<MessageReceiptListResponse>
}

export async function getMessageReceiptDetail(id: string) {
  const response = await fetch(`/api/message-receipts/${id}`)
  if (!response.ok) {
    throw new Error("加载记录详情失败")
  }

  return response.json() as Promise<MessageReceiptDetailResponse>
}
