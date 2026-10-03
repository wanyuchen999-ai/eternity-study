export type RawWord = { term: string; definition: string }

/** 解析词库文本：支持 JSON 数组 / CSV / 「单词 释义」制表符或逗号等分隔 */
export function parseWordBank(text: string): RawWord[] {
  const t = text.trim()
  if (!t) return []
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t)
      if (Array.isArray(arr)) {
        return arr
          .map((it: unknown) => {
            if (typeof it === 'string') return { term: it, definition: '' }
            const o = it as Record<string, unknown>
            const term = String(o.term ?? o.word ?? o.name ?? '').trim()
            const definition = String(o.definition ?? o.meaning ?? o.def ?? o.trans ?? o.translation ?? '').trim()
            return { term, definition }
          })
          .filter((w) => w.term)
      }
    } catch {
      /* 落到逐行解析 */
    }
  }
  const out: RawWord[] = []
  const lines = t.split(/\r?\n/)
  for (const [i, line] of lines.entries()) {
    const l = line.trim()
    if (!l) continue
    if (i === 0 && /word|单词|term/i.test(l) && /def|释义|meaning|翻译|trans/i.test(l)) continue // 表头
    const parts = l
      .split(/\t+|\s*[|；;]\s*|\s*,\s*|\s*，\s*|\s*[：:]\s*|\s+-\s+|\s+—\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 1) {
      // 没有分隔符：第一个空格切开（英文词 + 中文释义）
      const m = l.match(/^(\S+)\s+(.+)$/)
      if (m) out.push({ term: m[1], definition: m[2] })
      else out.push({ term: l, definition: '' })
    } else {
      out.push({ term: parts[0], definition: parts.slice(1).join('；') })
    }
  }
  return out
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(new Error('读取文件失败'))
    r.readAsText(file)
  })
}
