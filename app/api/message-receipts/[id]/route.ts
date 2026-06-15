import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getMessageReceiptDetail } from "@/lib/message-receipts"

export const runtime = "edge"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const { id } = await params
    const result = await getMessageReceiptDetail({
      id,
      userId: session.user.id,
    })

    if (!result) {
      return new NextResponse("Not Found", { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[MESSAGE_RECEIPT_DETAIL_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
