"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MessageReceipt, MessageReceiptDetailResponse, ReceiptSourceType } from "@/types/message-receipts"
import { getMessageReceiptDetail, getMessageReceiptList } from "@/lib/services/message-receipts"
import { formatDate } from "@/lib/utils"
import { MessageReceiptDetailDialog } from "./message-receipt-detail-dialog"

interface MessageReceiptSectionProps {
  title: string
  defaultSourceType: ReceiptSourceType | "all"
}

export function MessageReceiptSection({
  title,
  defaultSourceType,
}: MessageReceiptSectionProps) {
  const [filter, setFilter] = useState<ReceiptSourceType | "all">(defaultSourceType)
  const [records, setRecords] = useState<MessageReceipt[]>([])
  const [summary, setSummary] = useState({
    total: 0,
    success: 0,
    failed: 0,
    partial: 0,
  })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<MessageReceiptDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const { toast } = useToast()

  async function loadRecords(nextPage = page, nextFilter = filter) {
    try {
      setLoading(true)
      const result = await getMessageReceiptList({
        sourceType: nextFilter,
        page: nextPage,
        pageSize,
      })
      setRecords(result.records)
      setSummary(result.summary)
      setTotal(result.pagination.total)
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "加载接收消息记录失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setFilter(defaultSourceType)
    setPage(1)
    loadRecords(1, defaultSourceType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSourceType])

  async function handleViewDetail(id: string) {
    try {
      setDetailLoading(true)
      const result = await getMessageReceiptDetail(id)
      setDetail(result)
      setDetailOpen(true)
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "加载记录详情失败",
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            查看外部系统调用平台接口后的接收与发送记录。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter("all")
              setPage(1)
              loadRecords(1, "all")
            }}
          >
            全部
          </Button>
          <Button
            variant={filter === "endpoint" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter("endpoint")
              setPage(1)
              loadRecords(1, "endpoint")
            }}
          >
            推送接口
          </Button>
          <Button
            variant={filter === "group" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter("group")
              setPage(1)
              loadRecords(1, "group")
            }}
          >
            接口组
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border p-3 text-sm">总数: {summary.total}</div>
        <div className="rounded-md border p-3 text-sm">成功: {summary.success}</div>
        <div className="rounded-md border p-3 text-sm">失败: {summary.failed}</div>
        <div className="rounded-md border p-3 text-sm">部分成功: {summary.partial}</div>
      </div>

      <div className="mt-4 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>来源名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>成功/失败</TableHead>
              <TableHead>接收时间</TableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  暂无接收消息记录
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.sourceName}</TableCell>
                  <TableCell>{record.sourceType === "endpoint" ? "接口" : "接口组"}</TableCell>
                  <TableCell>{record.status}</TableCell>
                  <TableCell>{record.successCount} / {record.failedCount}</TableCell>
                  <TableCell>{formatDate(record.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={detailLoading}
                      onClick={() => handleViewDetail(record.id)}
                    >
                      查看详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            const nextPage = page - 1
            setPage(nextPage)
            loadRecords(nextPage, filter)
          }}
        >
          上一页
        </Button>
        <span className="text-sm text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => {
            const nextPage = page + 1
            setPage(nextPage)
            loadRecords(nextPage, filter)
          }}
        >
          下一页
        </Button>
      </div>

      <MessageReceiptDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
      />
    </div>
  )
}
