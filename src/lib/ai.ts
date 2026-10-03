import { useSettings } from '../store/settings'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }

export function aiConfigured() {
  return !!useSettings.getState().ai.apiKey
}

const baseUrl = () => useSettings.getState().ai.baseUrl.trim().replace(/\/+$/, '')

async function errText(res: Response) {
  let t = ''
  try {
    t = await res.text()
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) return `鉴权失败(${res.status})：请到「设置」检查 API 密钥是否正确`
  if (res.status === 404) return `接口不存在(404)：请到「设置」检查 API 地址是否正确（一般以 /v4 或 /v1 结尾）`
  return `请求失败(${res.status})：${t.slice(0, 300)}`
}

function networkHint(e: unknown): Error {
  if (e instanceof TypeError) {
    return new Error(
      '网络错误：请检查 API 地址是否可达；若浏览器控制台出现 CORS 报错，说明该服务商不允许网页直连，可换用智谱 / DeepSeek 等，或以后加一层代理。'
    )
  }
  return e instanceof Error ? e : new Error(String(e))
}

export async function chat(
  msgs: ChatMsg[],
  opts: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; onDelta?: (t: string) => void } = {}
): Promise<string> {
  const cfg = useSettings.getState().ai
  if (!cfg.apiKey) throw new Error('尚未配置 AI 密钥：请到「设置」页填写 API 地址与密钥')
  const stream = !!opts.onDelta
  const body: Record<string, unknown> = {
    model: opts.model || cfg.chatModel,
    messages: msgs,
    temperature: opts.temperature ?? 0.6,
    stream,
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens
  let res: Response
  try {
    res = await fetch(baseUrl() + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch (e) {
    throw networkHint(e)
  }
  if (!res.ok) throw new Error(await errText(res))

  if (!stream) {
    const data = await res.json()
    const c = data?.choices?.[0]?.message?.content
    if (typeof c !== 'string') throw new Error('AI 返回格式异常，请重试或更换模型')
    return c
  }

  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const delta = j?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          full += delta
          opts.onDelta!(delta)
        }
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
  return full
}

/** 语音转写（OpenAI 兼容 /audio/transcriptions） */
export async function transcribe(file: Blob, filename: string): Promise<string> {
  const cfg = useSettings.getState().ai
  if (!cfg.apiKey) throw new Error('尚未配置 AI 密钥：请到「设置」页填写')
  const fd = new FormData()
  fd.append('file', file, filename)
  fd.append('model', cfg.asrModel || 'glm-asr')
  let res: Response
  try {
    res = await fetch(baseUrl() + '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: fd,
    })
  } catch (e) {
    throw networkHint(e)
  }
  if (!res.ok) throw new Error(await errText(res))
  const data = await res.json()
  const text = data?.text ?? data?.data?.text ?? ''
  if (!text) throw new Error('转写结果为空，请检查转写模型配置或手动粘贴文本')
  return String(text)
}

export const imageURLContent = (dataUrl: string): ContentPart => ({ type: 'image_url', image_url: { url: dataUrl } })

/** 从 AI 输出中尽力提取 JSON（容忍 ```json 包裹与前后闲话） */
export function extractJson<T = unknown>(text: string): T {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.search(/[{[]/)
  if (start > 0) t = t.slice(start)
  try {
    return JSON.parse(t) as T
  } catch {
    /* 继续兜底 */
  }
  const last = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'))
  if (last > 0) {
    try {
      return JSON.parse(t.slice(0, last + 1)) as T
    } catch {
      /* 放弃 */
    }
  }
  throw new Error('AI 返回的内容无法解析为 JSON，请重试，或到「设置」更换更强的模型')
}
