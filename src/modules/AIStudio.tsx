import { useEffect, useRef, useState } from 'react'
import { Card, Tabs, Button, Tag, Modal, Empty, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'
import { chat, transcribe, extractJson, imageURLContent, aiConfigured, type ChatMsg } from '../lib/ai'
import { mdToHtml, pullCards, pullTitle, pullPlan } from '../lib/md'
import { readTextFile } from '../lib/parse'
import { useNotes, SOURCE_LABEL, type Note } from '../store/notes'
import { useQuestions } from '../store/questions'
import { useTodos } from '../store/todos'
import { toast } from '../store/ui'
import { fmtDateTime, download, todayKey } from '../lib/util'

const TABS = [
  { key: 'record', label: '课堂录音' },
  { key: 'chat', label: 'AI 对话' },
  { key: 'plan', label: '学习规划' },
  { key: 'summary', label: '笔记归纳' },
  { key: 'notes', label: '笔记库' },
]

function AIHint() {
  if (aiConfigured()) return null
  return (
    <div className="ai-warn">
      <Icon name="zap" size={15} /> 还没配置 AI：请先到 <a href="#/settings">设置</a> 填写 API 地址与密钥
    </div>
  )
}

/* ---------------- 课堂录音 ---------------- */

const RECORD_PROMPT =
  '你是专业的课堂笔记整理助手。把用户提供的课堂录音转写稿整理成结构化笔记。' +
  '第一行输出 <TITLE>本节课主题（15字内）</TITLE>，然后输出 Markdown 正文，包含以下小节（没有内容的小节可省略）：\n' +
  '## 大纲脉络（按讲解顺序，层级列表）\n## 核心知识点（要点化，重点加粗）\n## 重要概念与解释\n## 例题/案例（如有）\n## 课后任务与考试提示（如有）\n## 我的疑问（整理时发现的、值得课后弄清的问题）\n' +
  '语言精炼、忠实原意、不要编造。'

function RecordTab() {
  const upsertNote = useNotes((s) => s.upsert)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [blobUrl, setBlobUrl] = useState('')
  const [transcript, setTranscript] = useState('')
  const [title, setTitle] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState<'transcribe' | 'organize' | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number>(0)

  useEffect(() => () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setBlob(b)
        setBlobUrl(URL.createObjectURL(b))
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      mrRef.current = mr
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      toast('无法访问麦克风：请检查浏览器权限，或改用「上传音频文件」', 'err')
    }
  }

  const stopRec = () => {
    mrRef.current?.stop()
    setRecording(false)
    clearInterval(timerRef.current)
  }

  const onUpload = async (f: File | undefined) => {
    if (!f) return
    setBlob(f)
    setBlobUrl(URL.createObjectURL(f))
    toast('已读取音频文件，可以点击「AI 转写」了', 'ok')
  }

  const doTranscribe = async () => {
    if (!blob) return toast('请先录音或上传音频', 'err')
    setBusy('transcribe')
    try {
      const text = await transcribe(blob, 'lecture.webm')
      setTranscript(text)
      toast('转写完成，请检查后整理成笔记', 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const doOrganize = async () => {
    const text = transcript.trim()
    if (!text) return toast('请先获得转写文本（AI 转写或手动粘贴）', 'err')
    setBusy('organize')
    setResult('')
    setSavedId(null)
    setDirty(false)
    try {
      const out = await chat(
        [
          { role: 'system', content: RECORD_PROMPT },
          { role: 'user', content: `课堂主题：${title || '未提供'}\n\n转写稿：\n${text.slice(0, 40000)}` },
        ],
        { temperature: 0.3 }
      )
      const { text: body, title: aiTitle } = pullTitle(out)
      setResult(body)
      const finalTitle = title.trim() || aiTitle || `课堂笔记 ${todayKey()}`
      setTitle(finalTitle)
      const id = upsertNote({ title: finalTitle, content: body, source: 'record', tags: ['课堂'] })
      setSavedId(id)
      toast(`已自动存入笔记库：《${finalTitle}》`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const saveEdit = () => {
    if (!savedId) return
    useNotes.getState().update(savedId, { title: title.trim() || '课堂笔记', content: result })
    setDirty(false)
    toast('已更新笔记库中的这条笔记', 'ok')
  }

  return (
    <div>
      <AIHint />
      <div className="grid2 mt12">
        <Card title="① 录音 / 上传">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {recording ? (
              <Button variant="danger" icon="pause" onClick={stopRec}>停止录音 ({Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')})</Button>
            ) : (
              <Button icon="mic" onClick={startRec}>开始录音</Button>
            )}
            <label className="btn btn-ghost btn-md">
              <Icon name="upload" size={16} />
              <span>上传音频文件</span>
              <input type="file" accept="audio/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
            </label>
          </div>
          {blobUrl && (
            <div className="mt12">
              <audio controls src={blobUrl} style={{ width: '100%' }} />
              <div className="field-hint mt8">已就绪（{(blob!.size / 1024 / 1024).toFixed(1)} MB），点击下方「AI 转写」</div>
            </div>
          )}
          <div className="mt12">
            <Button icon="chat" onClick={doTranscribe} disabled={!blob || busy !== null}>
              {busy === 'transcribe' ? <><Spinner /> 转写中…</> : 'AI 转写'}
            </Button>
          </div>
          <div className="field-hint mt12">若转写不可用（如服务商不支持语音），可以先用讯飞等其他工具转写，再把文本粘贴到右边。</div>
        </Card>

        <Card title="② 转写文本（可手动粘贴）">
          <textarea
            className="input"
            rows={8}
            placeholder="AI 转写结果会出现在这里；也可以直接粘贴转写文本或课堂要点"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </Card>
      </div>

      <Card className="mt16" title="③ AI 整理成结构化笔记" extra={savedId ? <Tag color="green">已自动存入笔记库</Tag> : undefined}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="课堂主题（可选，AI 会自动起名）" value={title} onChange={(e) => { setTitle(e.target.value); if (savedId) setDirty(true) }} />
          <Button icon="sparkles" onClick={doOrganize} disabled={busy !== null || !transcript.trim()}>
            {busy === 'organize' ? <><Spinner /> 整理中…</> : 'AI 整理成笔记'}
          </Button>
        </div>
        {busy === 'organize' && <div className="ai-loading">正在整理，通常需要十几秒…</div>}
        {result && (
          <div className="mt12">
            <textarea className="input" rows={12} value={result} onChange={(e) => { setResult(e.target.value); setDirty(true) }} />
            <div className="row mt12" style={{ gap: 10 }}>
              {dirty && <Button icon="check" onClick={saveEdit}>保存修改到笔记库</Button>}
              <Button variant="ghost" icon="edit" onClick={() => { setResult(''); setSavedId(null); setDirty(false) }}>清空结果</Button>
              <span className="field-hint">{savedId && !dirty ? '✅ 生成后已自动存入笔记库，可直接修改标题或内容后保存' : ''}</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------------- AI 对话 ---------------- */

const MODES: { key: string; label: string; system: string }[] = [
  {
    key: 'free',
    label: '自由提问',
    system: '你是一名经验丰富的学习教练。用中文回答，结构清晰，重点加粗，适当举例，避免空话。',
  },
  {
    key: 'framework',
    label: '逻辑框架',
    system:
      '你擅长把知识整理成逻辑框架。用户给你一个主题/知识点/一段材料，你输出 Markdown：\n' +
      '## 一、整体框架（用层级编号列出主干与分支，每条尽量短）\n## 二、关键概念速览（一句话解释）\n## 三、记忆线索（口诀/联想/对比表格）\n## 四、自测三问（附简短答案）\n简洁、可背诵、不啰嗦。',
  },
  {
    key: 'feynman',
    label: '费曼讲解',
    system:
      '用费曼技巧讲解用户给出的概念，输出 Markdown：\n1. **一句话本质**\n2. **讲给初中生听**（用生活化比喻，不堆术语）\n3. **常见误区**（大家最容易理解错的地方）\n4. **一个例子走一遍**\n5. **检验你**（留 1 个问题让用户回答）',
  },
  {
    key: 'quiz',
    label: '出题自测',
    system:
      '根据用户提供的材料出 5 道自测题（混合选择/填空/简答），先给题目（编号清晰），最后统一给出「参考答案与解析」。用 Markdown 输出。',
  },
]

function ChatTab() {
  const [mode, setMode] = useState('free')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const upsertNote = useNotes((s) => s.upsert)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history: { role: 'user' | 'assistant'; content: string }[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setStreaming(true)
    abortRef.current = new AbortController()
    const sys = MODES.find((m) => m.key === mode)!.system
    const msgs: ChatMsg[] = [{ role: 'system', content: sys }, ...history.map((m) => ({ role: m.role, content: m.content }))]
    try {
      await chat(msgs, {
        signal: abortRef.current.signal,
        onDelta: (d) => {
          setMessages((ms) => {
            const next = [...ms]
            next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + d }
            return next
          })
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((ms) => {
        const next = [...ms]
        next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content || `⚠️ ${msg}` }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }

  const saveMsg = (content: string) => {
    const first = content.split('\n').find((l) => l.trim()) ?? 'AI 框架'
    upsertNote({
      title: first.replace(/^#+\s*/, '').slice(0, 30) || 'AI 框架',
      content,
      source: 'chat',
      tags: [MODES.find((m) => m.key === mode)!.label],
    })
    toast('已保存到笔记库', 'ok')
  }

  return (
    <div>
      <AIHint />
      <div className="row mt12" style={{ gap: 8, flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <button key={m.key} className={`chip ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>
            {m.label}
          </button>
        ))}
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" icon="trash" className="ml-auto" onClick={() => setMessages([])}>清空对话</Button>
        )}
      </div>

      <div className="chat-box card mt12" ref={scrollRef}>
        {messages.length === 0 ? (
          <Empty icon="chat" text="给它一个重点、一段材料或一个概念，它会还你一个能背的框架。试试：「力与运动」或粘贴一段课堂笔记" />
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="chat-role">{m.role === 'user' ? '我' : 'AI'}</div>
              {m.role === 'assistant' ? (
                <div className="md-body chat-content" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
              ) : (
                <div className="chat-content user-plain">{m.content}</div>
              )}
              {m.role === 'assistant' && m.content && !streaming && (
                <button className="icon-btn" title="保存为笔记" onClick={() => saveMsg(m.content)}>
                  <Icon name="plus" size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="chat-input row mt12">
        <textarea
          className="input"
          rows={2}
          placeholder="输入内容，Enter 发送，Shift+Enter 换行"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        {streaming ? (
          <Button variant="danger" onClick={() => abortRef.current?.abort()}>停止</Button>
        ) : (
          <Button icon="send" onClick={send}>发送</Button>
        )}
      </div>
    </div>
  )
}

/* ---------------- 学习规划 ---------------- */

const PLAN_PROMPT = (today: string) =>
  `你是学生的学习规划师，今天的日期是 ${today}。请帮学生制定真正可执行的学习计划。
对话规则：
1. 先了解必要信息：学什么/目标是什么、计划周期（从几月几日到几月几日，或总共几周）、每天能投入多少时间、当前基础。信息不够就先提问，一次最多问两三个问题，语气自然。
2. 信息足够后，直接给出完整计划（不必反复确认）：用 Markdown 表格或分组列表展示，按天或按周划分，每条写清日期范围、学什么、做什么、产出什么。任务要具体可执行：总周期超过 3 周就按周拆，否则按天拆。
3. 给出计划的同时，在回复最末尾单独一行输出：
<PLAN_JSON>[{"date":"${today}","title":"任务标题（15字内）","subject":"学科"}]</PLAN_JSON>
date 用 yyyy-MM-dd，数组包含计划中的每一条任务。这段 JSON 会被程序解析并自动写入用户的待办清单，用户界面上不会显示这段原文，所以前面的 Markdown 必须完整展示计划内容。
4. 用户要求调整时，重新输出完整计划，并输出新的一份 PLAN_JSON（系统会用新任务自动覆盖旧任务）。`

type PMsg = { role: 'user' | 'assistant' | 'system'; content: string; ids?: string[] }

const cleanPlanText = (s: string) => s.replace(/<PLAN_JSON>[\s\S]*?<\/PLAN_JSON>/g, '').trim()

function PlannerTab() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<PMsg[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const importedRef = useRef<string[]>([])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const importPlan = (tasks: { date: string; title: string; subject?: string }[]): number => {
    const store = useTodos.getState()
    if (importedRef.current.length) {
      importedRef.current.forEach((id) => store.remove(id))
      importedRef.current = []
    }
    const items = tasks
      .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.title.trim())
      .map((t) => ({ title: t.title.trim(), due: t.date, subject: (t.subject ?? '').trim() || '学习计划', priority: 1 as const }))
    if (!items.length) return 0
    const ids = store.addMany(items)
    importedRef.current = ids
    return ids.length
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const history: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of messages) if (m.role !== 'system') history.push({ role: m.role, content: cleanPlanText(m.content) })
    history.push({ role: 'user', content: text })
    setMessages([...history, { role: 'assistant', content: '' }] as PMsg[])
    setStreaming(true)
    abortRef.current = new AbortController()
    try {
      const full = await chat(
        [{ role: 'system', content: PLAN_PROMPT(todayKey()) }, ...history],
        { signal: abortRef.current.signal, temperature: 0.5 }
      )
      const { tasks } = pullPlan(full)
      const display = cleanPlanText(full)
      setMessages((ms) => {
        const next = [...ms]
        next[next.length - 1] = { role: 'assistant', content: display }
        return next
      })
      if (tasks.length) {
        const n = importPlan(tasks)
        if (n > 0) {
          const ids = [...importedRef.current]
          setMessages((ms) => [...ms, { role: 'system', content: `✅ 已自动把 ${n} 条计划任务写入「待办」（含截止日期）`, ids }])
          toast(`已自动创建 ${n} 条学习计划待办`, 'ok')
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((ms) => {
        const next = [...ms]
        next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content || `⚠️ ${msg}` }
        return next
      })
    } finally {
      setStreaming(false)
    }
  }

  const revoke = (m: PMsg) => {
    const store = useTodos.getState()
    ;(m.ids ?? []).forEach((id) => store.remove(id))
    importedRef.current = []
    setMessages((ms) => ms.map((x) => (x === m ? { ...x, content: '↩️ 已撤销这批自动写入的待办任务', ids: undefined } : x)))
    toast('已撤销自动写入的待办', 'ok')
  }

  return (
    <div>
      <AIHint />
      <div className="chat-box card mt12" ref={scrollRef}>
        {messages.length === 0 ? (
          <Empty icon="target" text="告诉 AI 你想学什么，它会和你确认周期与时间，然后把每天/每周的任务自动写进「待办」">
            <div className="row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              {['我想学 Python', '备考 12 月的英语四级', '两周复习完高数第三章到第五章'].map((s) => (
                <button key={s} className="chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Empty>
        ) : (
          messages.map((m, i) =>
            m.role === 'system' ? (
              <div key={i} className="plan-system">
                <span>{m.content}</span>
                {m.ids && (
                  <>
                    <a href="#/todos">去待办查看</a>
                    <button className="btn btn-ghost btn-sm" onClick={() => revoke(m)}>撤销</button>
                  </>
                )}
              </div>
            ) : (
              <div key={i} className={`chat-msg ${m.role}`}>
                <div className="chat-role">{m.role === 'user' ? '我' : 'AI'}</div>
                {m.role === 'assistant' ? (
                  <div className="md-body chat-content" dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
                ) : (
                  <div className="chat-content user-plain">{m.content}</div>
                )}
              </div>
            )
          )
        )}
      </div>

      <div className="chat-input row mt12">
        <textarea
          className="input"
          rows={2}
          placeholder="告诉 AI 你想学什么、大概什么周期，例如：我想这学期学会 Python 基础"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        {streaming ? (
          <Button variant="danger" onClick={() => abortRef.current?.abort()}>停止</Button>
        ) : (
          <Button icon="send" onClick={send}>发送</Button>
        )}
      </div>
    </div>
  )
}

/* ---------------- 笔记归纳 ---------------- */

const STYLE_PROMPTS: Record<string, string> = {
  qa:
    '你是背诵整理专家。把用户提供的多份笔记/资料去重、合并，整理成「可直接背诵」的问答框架。要求：\n' +
    '1. 第一行输出 <TITLE>这份资料的主题（10字内）</TITLE>\n' +
    '2. 按主题分节（## 节标题）\n3. 每个知识点写成「**问：**……\n**答：**要点1；要点2；要点3」格式，答案要点化\n' +
    '4. 结尾加「## 一页速记」用最短的列表概括全部骨架\n' +
    '5. 输出 Markdown。在最末尾单独输出 <CARD_JSON>[{"q":"问题","a":"答案"},...]</CARD_JSON>（把上面的问答整理成 JSON 数组，便于程序读取）',
  outline:
    '你是知识架构师。把用户提供的多份笔记/资料合并成一份层级化的逻辑框架：第一行输出 <TITLE>主题（10字内）</TITLE>；然后用 Markdown 输出 一级主题 → 二级要点 → 三级细节，并标注重点（加粗）。只输出框架本身，简洁完整。',
  points:
    '你是考点提炼专家。把用户提供的多份笔记/资料整理成考点清单：第一行输出 <TITLE>科目或主题（10字内）</TITLE>；然后用 Markdown 按科目/章节列出高频考点，每条标注重要程度（★★★/★★/★）和一句话要点。',
}

function SummaryTab() {
  const upsertNote = useNotes((s) => s.upsert)
  const addQuestions = useQuestions((s) => s.addMany)
  const [style, setStyle] = useState<'qa' | 'outline' | 'points'>('qa')
  const [raw, setRaw] = useState('')
  const [subject, setSubject] = useState('')
  const [result, setResult] = useState('')
  const [cards, setCards] = useState<{ q: string; a: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedTitle, setSavedTitle] = useState('')
  const [dirty, setDirty] = useState(false)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const texts: string[] = []
    for (const f of Array.from(files)) texts.push(`# 来源文件：${f.name}\n${await readTextFile(f)}`)
    setRaw((r) => (r ? r + '\n\n' : '') + texts.join('\n\n'))
    toast(`已读取 ${files.length} 个文件，可继续手动补充`, 'ok')
  }

  const run = async () => {
    if (!raw.trim()) return toast('请先粘贴笔记或导入文件', 'err')
    setBusy(true)
    setResult('')
    setCards([])
    setSavedId(null)
    setDirty(false)
    try {
      const out = await chat(
        [
          { role: 'system', content: STYLE_PROMPTS[style] },
          { role: 'user', content: raw.slice(0, 60000) },
        ],
        { temperature: 0.3 }
      )
      let text = out
      let aiTitle = ''
      if (style === 'qa') {
        const pc = pullCards(out)
        const pt = pullTitle(pc.text)
        text = pt.text
        aiTitle = pt.title
        setCards(pc.cards)
      } else {
        const pt = pullTitle(out)
        text = pt.text
        aiTitle = pt.title
      }
      setResult(text)
      // 自动落库：AI 主题命名，无需手动保存
      const finalTitle = aiTitle || subject.trim() || `归纳笔记 ${todayKey()}`
      const id = upsertNote({ title: finalTitle, content: text, source: 'summary', tags: subject.trim() ? [subject.trim()] : ['归纳'] })
      setSavedId(id)
      setSavedTitle(finalTitle)
      toast(`已自动存入笔记库：《${finalTitle}》`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = () => {
    if (!savedId) return
    useNotes.getState().update(savedId, { title: savedTitle, content: result })
    setDirty(false)
    toast('已更新笔记库中的这条笔记', 'ok')
  }

  const toBank = () => {
    if (!cards.length) return toast('没有可转换的问答卡片（只有「问答背诵」风格会生成）', 'err')
    addQuestions(
      cards.map((c) => ({
        type: 'short' as const,
        stem: c.q,
        answer: c.a,
        subject: subject.trim() || savedTitle || '背诵卡片',
        source: 'note' as const,
      }))
    )
    toast(`已把 ${cards.length} 张问答卡转入题库，可去「题库 → 练习」背诵自测`, 'ok')
  }

  return (
    <div>
      <AIHint />
      <Card className="mt12" title="① 导入资料（多个文件 / 长文本都可以）">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <label className="btn btn-ghost btn-md">
            <Icon name="upload" size={16} />
            <span>导入 .txt / .md 文件</span>
            <input type="file" accept=".txt,.md,.markdown,text/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          </label>
          <span className="field-hint">比如从各网站下载的学习笔记，一次丢进来合并归纳</span>
        </div>
        <textarea className="input" rows={8} placeholder="把你的学习笔记粘贴到这里（可多次追加）" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <div className="field-hint mt8">当前字数：{raw.length}</div>
      </Card>

      <Card className="mt16" title="② 选择归纳风格并生成" extra={<Tag color="green">生成后自动存入笔记库</Tag>}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['qa', '问答背诵（例：问题1…问题2…）'],
              ['outline', '一页逻辑框架'],
              ['points', '考点清单'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={`chip ${style === k ? 'active' : ''}`} onClick={() => setStyle(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="科目（可选，如：政治，会作为笔记标签）" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Button icon="sparkles" onClick={run} disabled={busy}>
            {busy ? <><Spinner /> 归纳中，长文可能需要 1 分钟…</> : 'AI 归纳'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="mt16" title={`③ 归纳结果${savedTitle ? `：《${savedTitle}》` : ''}`}>
          <textarea
            className="input"
            rows={14}
            value={result}
            onChange={(e) => {
              setResult(e.target.value)
              setDirty(true)
            }}
          />
          <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
            {dirty && <Button icon="check" onClick={saveEdit}>保存修改</Button>}
            {style === 'qa' && (
              <Button variant="soft" icon="layers" onClick={toBank}>转入题库背诵（{cards.length} 张卡）</Button>
            )}
            <span className="field-hint">
              {dirty ? '内容已修改，记得保存' : '✅ 已自动存入「AI 学习台 → 笔记库」，无需手动保存'}
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ---------------- 笔记库 ---------------- */

function NotesTab() {
  const notes = useNotes((s) => s.notes)
  const update = useNotes((s) => s.update)
  const remove = useNotes((s) => s.remove)
  const upsert = useNotes((s) => s.upsert)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Note | null>(null)
  const [viewing, setViewing] = useState<Note | null>(null)

  const list = notes
    .filter((n) => !q.trim() || (n.title + n.content).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const newNote = () => {
    const id = upsert({ title: '新笔记', content: '', source: 'manual', tags: [] })
    const n = useNotes.getState().notes.find((x) => x.id === id)
    if (n) setEditing(n)
  }

  return (
    <div>
      <div className="row mt12">
        <input className="input" placeholder="搜索笔记标题或内容…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button icon="plus" onClick={newNote}>新建笔记</Button>
      </div>

      {list.length === 0 ? (
        <Empty icon="fileText" text="还没有笔记。课堂录音整理、AI 对话框架、批量归纳的结果都会自动存到这里" />
      ) : (
        <div className="grid2 mt16">
          {list.map((n) => (
            <Card key={n.id} className="note-card">
              <div className="note-title" onClick={() => setViewing(n)}>{n.title || '（无标题）'}</div>
              <div className="note-preview" onClick={() => setViewing(n)}>
                {n.content.replace(/[#*`>\-\n]/g, ' ').slice(0, 80) || '（空笔记）'}
              </div>
              <div className="row mt8" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Tag color="indigo">{SOURCE_LABEL[n.source]}</Tag>
                {n.tags.map((t) => (
                  <Tag key={t} color="gray">{t}</Tag>
                ))}
                <span className="field-hint">{fmtDateTime(n.updatedAt)}</span>
                <span className="row ml-auto" style={{ gap: 2 }}>
                  <button className="icon-btn" title="编辑" onClick={() => setEditing(n)}><Icon name="edit" size={14} /></button>
                  <button className="icon-btn" title="导出 .md" onClick={() => download(`${n.title || '笔记'}.md`, n.content, 'text/markdown')}><Icon name="download" size={14} /></button>
                  <button className="icon-btn" title="删除" onClick={() => { if (confirm('确定删除这条笔记？')) remove(n.id) }}><Icon name="trash" size={14} /></button>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ''} wide>
        {viewing && <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtml(viewing.content) }} />}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑笔记" wide>
        {editing && (
          <>
            <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <textarea
              className="input mt12"
              rows={16}
              style={{ fontFamily: 'Consolas, monospace' }}
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            <div className="row mt12" style={{ justifyContent: 'flex-end' }}>
              <Button icon="check" onClick={() => { update(editing.id, { title: editing.title, content: editing.content }); setEditing(null); toast('已保存', 'ok') }}>
                保存
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default function AIStudio() {
  const [tab, setTab] = useState('record')
  return (
    <div>
      <h1 className="page-title">AI 学习台</h1>
      <p className="page-sub">录音转笔记 · 对话出框架 · 制定计划自动进待办 · 批量归纳背诵材料</p>
      <div className="mt12">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      <div className="mt16">
        {tab === 'record' && <RecordTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'plan' && <PlannerTab />}
        {tab === 'summary' && <SummaryTab />}
        {tab === 'notes' && <NotesTab />}
      </div>
    </div>
  )
}
