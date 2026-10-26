// 内置函数定义
const BUILT_IN_FUNCTIONS = {
  // 截断字符串,超过maxLength的部分用...替代
  truncate: (str: string, maxLength: number) => {
    if (!str || str.length <= maxLength) return str
    return str.slice(0, maxLength) + '...'
  },
  
  // 获取当前时间,支持自定义格式和时区偏移量
  now: (format = 'YYYY-MM-DD HH:mm:ss', timezone?: number | string) => {
    const date = new Date()
    
    // 处理时区
    let targetDate = date
    if (timezone !== undefined) {
      try {
        if (typeof timezone === 'number') {
          // 使用数字形式的时区偏移（小时）
          const localOffset = date.getTimezoneOffset()
          const targetOffset = timezone * 60 // 转换为分钟
          const diffOffset = targetOffset + localOffset
          targetDate = new Date(date.getTime() + diffOffset * 60 * 1000)
        } else {
          // 保持对字符串时区的支持
          const dateStr = date.toLocaleString('en-US', { timeZone: timezone })
          targetDate = new Date(dateStr)
        }
      } catch {
        console.warn(`时区设置无效: ${timezone}, 将使用本地时区`)
      }
    }
    
    const tokens: Record<string, () => string> = {
      YYYY: () => targetDate.getFullYear().toString(),
      MM: () => (targetDate.getMonth() + 1).toString().padStart(2, '0'),
      DD: () => targetDate.getDate().toString().padStart(2, '0'),
      HH: () => targetDate.getHours().toString().padStart(2, '0'),
      mm: () => targetDate.getMinutes().toString().padStart(2, '0'),
      ss: () => targetDate.getSeconds().toString().padStart(2, '0')
    }
    
    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, match => tokens[match]())
  }
} as const

type BuiltInFunction = keyof typeof BUILT_IN_FUNCTIONS

// Resolve each expression once: text coming from a request is data, not another template.
const EXPRESSION_REGEX = /\${(?:(\w+)\((.*?)\)|([\w.]+))}/g

export function safeInterpolate(
    template: string,
    data: Record<string, any>,
    fallback = ''
): string {
    const lookup = (path: string): unknown => path.split('.').reduce((value: any, key) => {
        return value != null && Object.hasOwn(value, key) ? value[key] : undefined
    }, data)

    const interpolate = (text: string, escapeJson = false) => text.replace(EXPRESSION_REGEX, (_, fnName, argsStr, path) => {
        let value: unknown
        try {
            if (fnName) {
                if (!Object.hasOwn(BUILT_IN_FUNCTIONS, fnName)) throw new Error(`未知的函数: ${fnName}`)
                const fn = BUILT_IN_FUNCTIONS[fnName as BuiltInFunction]
                const args = argsStr.trim() ? argsStr.split(',').map((arg: string) => {
                    const trimmed = arg.trim()
                    if (/^".*"$/.test(trimmed)) return JSON.parse(trimmed)
                    if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1)
                    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
                    return trimmed.includes('.') ? lookup(trimmed) : trimmed
                }) : []
                value = (fn as (...args: any[]) => unknown)(...args)
            } else {
                value = lookup(path)
            }
        } catch {
            value = undefined
        }
        const result = value === undefined ? fallback : String(value)
        return escapeJson ? JSON.stringify(result).slice(1, -1) : result
    })

    const render = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(render)
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, render(child)]))
        }
        if (typeof value !== 'string') return value

        // Rich-text textareas contain serialized JSON inside the outer message JSON.
        // Parse each template layer BEFORE substitution, then serialize each layer
        // separately so newlines, quotes and backslashes survive both JSON.parse calls.
        if (value.includes('${') && /^[\[{]/.test(value.trim())) {
            let nested: unknown
            try { nested = JSON.parse(value) } catch { return interpolate(value) }
            return JSON.stringify(render(nested))
        }
        return interpolate(value)
    }

    let message: unknown
    try { message = JSON.parse(template) }
    catch {
        // Keep legacy templates with unquoted numeric/boolean placeholders working.
        return interpolate(template, true)
    }
    return JSON.stringify(render(message))
}

