"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EndpointGroupTestResponse } from "@/lib/services/endpoint-groups"
import { PushDebugInfo } from "@/lib/services/endpoints"
import { useMemo, useState } from "react"

interface PushDebugDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  debug?: PushDebugInfo
  groupResult?: EndpointGroupTestResponse
}

function JsonBlock({ value }: { value: unknown }) {
  const isEmptyObject =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0

  return (
    <div className="rounded-lg bg-muted p-4">
      {isEmptyObject ? (
        <div className="mb-3 text-xs text-muted-foreground">
          当前请求体为空对象。通常表示这个模板没有引用任何 `${"{body.xxx}"}` 变量，测试推送不需要额外入参。
        </div>
      ) : null}
      <pre className="text-sm whitespace-pre-wrap break-all font-mono">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  )
}

function DebugPane({ debug }: { debug?: PushDebugInfo }) {
  return (
    <Tabs defaultValue="request" className="mt-4">
      <TabsList>
        <TabsTrigger value="request">请求体</TabsTrigger>
        <TabsTrigger value="rendered">模板结果</TabsTrigger>
        <TabsTrigger value="final">最终发送参数</TabsTrigger>
      </TabsList>
      <TabsContent value="request" className="mt-4">
        <JsonBlock value={debug?.requestBody} />
      </TabsContent>
      <TabsContent value="rendered" className="mt-4">
        <JsonBlock value={debug?.renderedMessage} />
      </TabsContent>
      <TabsContent value="final" className="mt-4">
        <JsonBlock value={debug?.finalPayload} />
      </TabsContent>
    </Tabs>
  )
}

export function PushDebugDialog({
  open,
  onOpenChange,
  title,
  description,
  debug,
  groupResult,
}: PushDebugDialogProps) {
  const debugDetails = useMemo(
    () => groupResult?.details.filter(detail => detail.debug) ?? [],
    [groupResult]
  )
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("")
  const activeDetail =
    debugDetails.find(detail => detail.endpoint === selectedEndpoint) ?? debugDetails[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {groupResult ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">总数: {groupResult.total}</div>
              <div className="rounded-md border p-3">成功: {groupResult.successCount}</div>
              <div className="rounded-md border p-3">失败: {groupResult.failedCount}</div>
            </div>

            <div className="rounded-md border">
              <div className="border-b px-4 py-3 text-sm font-medium">接口结果</div>
              <div className="max-h-[220px] overflow-y-auto">
                {groupResult.details.map((detail) => (
                  <div key={detail.endpoint} className="border-b px-4 py-3 text-sm last:border-b-0">
                    <div className="font-medium">{detail.endpoint}</div>
                    <div className={detail.status === "success" ? "text-emerald-600" : "text-red-600"}>
                      {detail.status === "success" ? "成功" : "失败"}
                    </div>
                    {detail.error ? (
                      <div className="mt-1 text-muted-foreground">{detail.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {activeDetail?.debug ? (
              <div className="space-y-4">
                <div className="rounded-md border">
                  <div className="border-b px-4 py-3 text-sm font-medium">查看参数的接口</div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {debugDetails.map((detail) => (
                      <button
                        key={detail.endpoint}
                        type="button"
                        onClick={() => setSelectedEndpoint(detail.endpoint)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          activeDetail.endpoint === detail.endpoint
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {detail.endpoint}
                      </button>
                    ))}
                  </div>
                </div>

                <DebugPane debug={activeDetail.debug} />
              </div>
            ) : null}
          </div>
        ) : (
          <DebugPane debug={debug} />
        )}
      </DialogContent>
    </Dialog>
  )
}
