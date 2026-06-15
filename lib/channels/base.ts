export interface TemplateField {
  key: string
  description?: string
  placeholder?: string
  required?: boolean
  component?: 'input' | 'textarea' | 'checkbox' | 'select' | 'hidden'
  defaultValue?: string
  options?: Array<{value: string, label: string}>
}

export interface MessageTemplate {
  type: string
  name: string
  description: string
  fields: TemplateField[]
}

export interface ChannelConfig {
  type: string
  label: string
  templates: MessageTemplate[]
}

export interface SendMessageOptions {
  webhook?: string
  secret?: string
  corpId?: string
  agentId?: string
  botToken?: string
  chatId?: string
  [key: string]: any
}

export interface SendMessageResult {
  response: Response
  finalPayload: any
  responseSummary?: unknown
}

export abstract class BaseChannel {
  abstract readonly config: ChannelConfig
  
  abstract sendMessage(message: any, options: SendMessageOptions): Promise<SendMessageResult>
  
  getTemplates(): MessageTemplate[] {
    return this.config.templates
  }
  
  getLabel(): string {
    return this.config.label
  }
  
  getType(): string {
    return this.config.type
  }
} 

export async function parseResponseSummary(response: Response) {
  const text = await response.clone().text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
