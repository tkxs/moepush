import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"
import { endpoints } from "@/lib/db/schema/endpoints"
import { eq } from "drizzle-orm"
import { safeInterpolate } from "@/lib/template"
import { sendChannelMessage } from "@/lib/channels"
import {
  tryCreateMessageReceipt,
  tryCreateMessageReceiptDelivery,
  tryFinalizeMessageReceipt,
} from "@/lib/message-receipts"

export const runtime = "edge"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let debugMode = false
  let sourceType: "endpoint" | "group" = "endpoint"
  let parentReceiptId: string | null = null
  let body: unknown = {}
  let renderedMessage: unknown = null
  let receiptId: string | null = null
  let receiptContext: {
    userId: string
    targetId: string
    targetName: string
    channelId: string
    channelName: string
    channelType: string
  } | null = null

  try {
    const { id } = await params

    const db = await getDb()
    const endpoint = await db.query.endpoints.findFirst({
      where: eq(endpoints.id, id),
      with: {
        channel: true,
      },
    })

    if (!endpoint || !endpoint.channel) {
      return new Response("接口不存在", { status: 404 })
    }

    if (endpoint.status !== "active") {
      return new Response("接口已禁用", { status: 403 })
    }

    body = await request.json()
    debugMode = request.headers.get("x-debug-push") === "1"
    sourceType = request.headers.get("x-source-type") === "group" ? "group" : "endpoint"
    parentReceiptId = request.headers.get("x-parent-receipt-id")
    console.log('body:', body)

    const processedTemplate = safeInterpolate(endpoint.rule, {
      body,
    })

    const messageObj = JSON.parse(processedTemplate)
    renderedMessage = structuredClone(messageObj)
    receiptContext = {
      userId: endpoint.userId,
      targetId: endpoint.id,
      targetName: endpoint.name,
      channelId: endpoint.channel.id,
      channelName: endpoint.channel.name,
      channelType: endpoint.channel.type,
    }

    // Message receipt is best-effort only and must never block delivery.
    receiptId = parentReceiptId
      ? parentReceiptId
      : !debugMode
        ? await tryCreateMessageReceipt({
            userId: endpoint.userId,
            sourceType,
            sourceId: endpoint.id,
            sourceName: endpoint.name,
            requestBody: body,
          })
        : null

    const sendResult = await sendChannelMessage(
      endpoint.channel.type as any,
      structuredClone(messageObj),
      {
        webhook: endpoint.channel.webhook,
        secret: endpoint.channel.secret,
        corpId: endpoint.channel.corpId,
        agentId: endpoint.channel.agentId,
        botToken: endpoint.channel.botToken,
        chatId: endpoint.channel.chatId,
      }
    )

    if (receiptId) {
      await tryCreateMessageReceiptDelivery({
        receiptId,
        userId: receiptContext.userId,
        targetId: receiptContext.targetId,
        targetName: receiptContext.targetName,
        channelId: receiptContext.channelId,
        channelName: receiptContext.channelName,
        channelType: receiptContext.channelType,
        status: "success",
        renderedMessage,
        finalPayload: sendResult.finalPayload,
        responseSummary: sendResult.responseSummary,
      })
      if (!parentReceiptId) {
        await tryFinalizeMessageReceipt(receiptId)
      }
    }

    return new Response(JSON.stringify({
      message: "推送成功",
      ...(debugMode ? {
        debug: {
          requestBody: body,
          renderedMessage,
          finalPayload: sendResult.finalPayload,
          channel: {
            id: endpoint.channel.id,
            name: endpoint.channel.name,
            type: endpoint.channel.type,
          }
        }
      } : {})
    }), { status: 200 })

  } catch (error) {
    console.error("Push error:", error)

    if (!debugMode && receiptId && receiptContext) {
      await tryCreateMessageReceiptDelivery({
        receiptId,
        userId: receiptContext.userId,
        targetId: receiptContext.targetId,
        targetName: receiptContext.targetName,
        channelId: receiptContext.channelId,
        channelName: receiptContext.channelName,
        channelType: receiptContext.channelType,
        status: "failed",
        renderedMessage,
        finalPayload: renderedMessage,
        errorMessage: error instanceof Error ? error.message : "推送失败",
      })
      if (!parentReceiptId) {
        await tryFinalizeMessageReceipt(receiptId)
      }
    }

    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : "推送失败",
        ...(debugMode ? {
          debug: {
            requestBody: body,
            renderedMessage,
            finalPayload: renderedMessage,
          }
        } : {})
      }),
      { status: 500 }
    )
  }
}
