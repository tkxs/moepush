import { Endpoint, NewEndpoint } from "@/lib/db/schema/endpoints"
import { generateExampleBody } from "../generator"

const API_URL = "/api/endpoints"

export interface PushDebugInfo {
  requestBody?: unknown
  renderedMessage?: unknown
  channel?: {
    id?: string
    name?: string
    type?: string
  }
}

export interface EndpointTestResponse {
  message: string
  debug?: PushDebugInfo
}

export class EndpointTestError extends Error {
  debug?: PushDebugInfo

  constructor(message: string, debug?: PushDebugInfo) {
    super(message)
    this.name = "EndpointTestError"
    this.debug = debug
  }
}

export async function createEndpoint(data: NewEndpoint) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    throw new Error("创建失败")
  }

  return res.json() as Promise<Endpoint>
}

export async function updateEndpoint(id: string, data: Partial<NewEndpoint>) {
  const res = await fetch(`${API_URL}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    throw new Error("更新失败")
  }

  return res.json() as Promise<Endpoint>
}

export async function deleteEndpoint(id: string) {
  const res = await fetch(`${API_URL}/${id}`, {
    method: "DELETE",
  })

  if (!res.ok) {
    throw new Error("删除失败")
  }
}

export async function toggleEndpointStatus(id: string) {
  const res = await fetch(`${API_URL}/${id}/toggle`, {
    method: "POST"
  })

  if (!res.ok) {
    throw new Error("切换状态失败")
  }

  return res.json() as Promise<Endpoint>
}

export async function testEndpoint(id: string, rule: string) {
  const exampleBody = generateExampleBody(rule)
  const res = await fetch(`/api/push/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-debug-push": "1",
    },
    body: JSON.stringify(exampleBody),
  })

  if (!res.ok) {
    const error = await res.json() as { message?: string, debug?: PushDebugInfo }
    throw new EndpointTestError(error.message || "测试失败", error.debug)
  }

  return res.json() as Promise<EndpointTestResponse>
}

export async function getEndpoints() {
  const response = await fetch(API_URL)
  if (!response.ok) {
    const error = await response.json() as { error: string }
    throw new Error(error.error || '获取接口失败')
  }
  return response.json()
}   
