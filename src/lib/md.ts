/** 极简 Markdown 渲染（先转义再解析，安全） */
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function mdToHtml(md: string): string {
  const lines = esc(md).split(/\r?\n/)
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inCode = false
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }
  const inline = (s: string) =>
    s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push('</code></pre>')
        inCode = false
      } else {
        closeList()
        out.push('<pre><code>')
        inCode = true
      }
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }
    // 表格：连续的 | 行，第二行为分隔行时按表头处理
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = []
      while (li < lines.length && /^\s*\|.*\|\s*$/.test(lines[li])) {
        const cells = lines[li].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) rows.push(cells)
        li++
      }
      li--
      closeList()
      if (rows.length) {
        const [head, ...body] = rows
        out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>')
        if (body.length) {
          out.push('<tbody>' + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>')
        }
        out.push('</table>')
      }
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) {
      closeList()
      const lv = Math.min(h[1].length + 1, 5)
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`)
      continue
    }
    const ul = line.match(/^\s*[-*]\s+(.*)/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }
    const ol = line.match(/^\s*\d+[.、)）]\s+(.*)/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    const bq = line.match(/^>\s?(.*)/)
    if (bq) {
      closeList()
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`)
      continue
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList()
      out.push('<hr/>')
      continue
    }
    if (/^\s*$/.test(line)) {
      closeList()
      continue
    }
    closeList()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}

/** 抽出 <TITLE>…</TITLE> 标记（AI 生成的主题标题） */
export function pullTitle(md: string): { text: string; title: string } {
  const m = md.match(/<TITLE>([\s\S]*?)<\/TITLE>/)
  if (!m) return { text: md, title: '' }
  return { text: md.replace(m[0], '').trim(), title: m[1].trim().slice(0, 60) }
}

/** 抽出 <PLAN_JSON>[...]</PLAN_JSON> 标记（学习计划任务） */
export function pullPlan(md: string): { text: string; tasks: { date: string; title: string; subject?: string }[] } {
  const m = md.match(/<PLAN_JSON>([\s\S]*?)<\/PLAN_JSON>/)
  if (!m) return { text: md, tasks: [] }
  let tasks: { date: string; title: string; subject?: string }[] = []
  try {
    const parsed = JSON.parse(m[1].trim())
    if (Array.isArray(parsed)) {
      tasks = parsed
        .filter((t) => t && typeof t.title === 'string' && typeof t.date === 'string')
        .map((t) => ({ date: t.date, title: t.title, subject: typeof t.subject === 'string' ? t.subject : undefined }))
    }
  } catch {
    /* 解析失败则当没有计划 */
  }
  return { text: md.replace(m[0], '').trim(), tasks }
}

/** 抽出 <CARD_JSON>[...]</CARD_JSON> 标记里的背诵卡片 */
export function pullCards(md: string): { text: string; cards: { q: string; a: string }[] } {
  const m = md.match(/<CARD_JSON>([\s\S]*?)<\/CARD_JSON>/)
  if (!m) return { text: md, cards: [] }
  let cards: { q: string; a: string }[] = []
  try {
    const parsed = JSON.parse(m[1].trim())
    if (Array.isArray(parsed)) cards = parsed.filter((c) => c && typeof c.q === 'string' && typeof c.a === 'string')
  } catch {
    /* 解析失败则当没有卡片 */
  }
  return { text: md.replace(m[0], '').trim(), cards }
}
