import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMessageReceipts } from "@/lib/message-receipts"

export const runtime = "edge"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const sourceTypeParam = searchParams.get("sourceType")
    const sourceId = searchParams.get("sourceId") || undefined
    const sourceType = sourceTypeParam === "endpoint" || sourceTypeParam === "group" ? sourceTypeParam : "all"
    const page = Math.max(1, Number(searchParams.get("page") || "1"))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || "10")))

    const result = await getMessageReceipts({
      userId: session.user.id,
      sourceType,
      sourceId,
      page,
      pageSize,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MESSAGE_RECEIPTS_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
