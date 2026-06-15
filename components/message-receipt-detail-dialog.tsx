"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MessageReceiptDetailResponse } from "@/types/message-receipts"
import { formatDate } from "@/lib/utils"
import { useEffect, useMemo, useState } from "react"

interface MessageReceiptDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail?: MessageReceiptDetailResponse | null
}

function JsonPanel({ value }: { value: unknown }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <pre className="text-sm whitespace-pre-wrap break-all font-mono">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  )
}

export function MessageReceiptDetailDialog({
  open,
  onOpenChange,
  detail,
}: MessageReceiptDetailDialogProps) {
  const deliveries = detail?.record.deliveries ?? []
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>("")
  const activeDelivery = useMemo(
    () => deliveries.find(item => item.id === selectedDeliveryId) ?? deliveries[0],
    [deliveries, selectedDeliveryId]
  )

  useEffect(() => {
    setSelectedDeliveryId("")
  }, [detail?.record.id, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>接收消息记录详情</DialogTitle>
          <DialogDescription>
            查看这次外部调用收到的原始请求以及实际发送明细。
          </DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">来源</div>
                <div className="mt-1 font-medium">{detail.record.sourceName}</div>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">状态</div>
                <div className="mt-1 font-medium">{detail.record.status}</div>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">成功 / 失败</div>
                <div className="mt-1 font-medium">{detail.record.successCount} / {detail.record.failedCount}</div>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-muted-foreground">接收时间</div>
                <div className="mt-1 font-medium">{formatDate(detail.record.createdAt)}</div>
              </div>
            </div>

            <Tabs defaultValue="request">
              <TabsList>
                <TabsTrigger value="request">原始请求体</TabsTrigger>
                <TabsTrigger value="deliveries">发送明细</TabsTrigger>
              </TabsList>
              <TabsContent value="request" className="mt-4">
                <JsonPanel value={detail.record.requestBody} />
              </TabsContent>
              <TabsContent value="deliveries" className="mt-4 space-y-4">
                <div className="rounded-md border">
                  <div className="border-b px-4 py-3 text-sm font-medium">发送目标</div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {deliveries.map((delivery) => (
                      <button
                        key={delivery.id}
                        type="button"
                        onClick={() => setSelectedDeliveryId(delivery.id)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          activeDelivery?.id === delivery.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {delivery.targetName}
                      </button>
                    ))}
                  </div>
                </div>

                {activeDelivery ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border p-3 text-sm">
                        <div className="text-muted-foreground">目标接口</div>
                        <div className="mt-1 font-medium">{activeDelivery.targetName}</div>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <div className="text-muted-foreground">渠道</div>
                        <div className="mt-1 font-medium">{activeDelivery.channelName}</div>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <div className="text-muted-foreground">状态</div>
                        <div className="mt-1 font-medium">{activeDelivery.status}</div>
                      </div>
                      <div className="rounded-md border p-3 text-sm">
                        <div className="text-muted-foreground">时间</div>
                        <div className="mt-1 font-medium">{formatDate(activeDelivery.createdAt)}</div>
                      </div>
                    </div>

                    <Tabs defaultValue="rendered">
                      <TabsList>
                        <TabsTrigger value="rendered">模板结果</TabsTrigger>
                        <TabsTrigger value="final">最终发送参数</TabsTrigger>
                        <TabsTrigger value="response">发送结果</TabsTrigger>
                      </TabsList>
                      <TabsContent value="rendered" className="mt-4">
                        <JsonPanel value={activeDelivery.renderedMessage} />
                      </TabsContent>
                      <TabsContent value="final" className="mt-4">
                        <JsonPanel value={activeDelivery.finalPayload} />
                      </TabsContent>
                      <TabsContent value="response" className="mt-4 space-y-4">
                        <JsonPanel value={activeDelivery.responseSummary} />
                        {activeDelivery.errorMessage ? (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                            {activeDelivery.errorMessage}
                          </div>
                        ) : null}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
