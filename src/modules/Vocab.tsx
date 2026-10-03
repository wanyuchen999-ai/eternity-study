import { useMemo, useState } from 'react'
import { Card, Tabs, Button, Empty, Tag, Modal, Field, ProgressBar, BarChart, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'
import { useVocab, EBBS } from '../store/vocab'
import { parseWordBank, readTextFile } from '../lib/parse'
import { chat, extractJson, aiConfigured } from '../lib/ai'
import { toast } from '../store/ui'
import { todayKey, lastNDays, weekdayLabel, shuffle } from '../lib/util'

const TABS = [
  { key: 'study', label: '今日学习' },
  { key: 'banks', label: '词库管理' },
  { key: 'stats', label: '学习记录' },
]

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* 浏览器不支持则忽略 */
  }
}

/* ---------- 今日学习 ---------- */

type QItem = { id: string; retry: boolean }

function StudyTab() {
  const banks = useVocab((s) => s.banks)
  const activeBankId = useVocab((s) => s.activeBankId)
  const progress = useVocab((s) => s.progress)
  const grade = useVocab((s) => s.grade)
  const dailyNew = useVocab((s) => s.dailyNew)
  const setDailyNew = useVocab((s) => s.setDailyNew)
  const log = useVocab((s) => s.log)

  const [queue, setQueue] = useState<QItem[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState({ new: 0, review: 0, ok: 0 })

  const bank = banks.find((b) => b.id === activeBankId)
  const now = Date.now()
  const dueCount = bank ? bank.words.filter((w) => progress[w.id] && progress[w.id].due <= now).length : 0
  const newCount = bank ? bank.words.filter((w) => !progress[w.id]).length : 0
  const newToday = log[todayKey()]?.new ?? 0
  const newQuota = Math.max(0, dailyNew - newToday)

  const start = () => {
    if (!bank) return
    const reviews = shuffle(bank.words.filter((w) => progress[w.id] && progress[w.id].due <= now).slice(0, 100).map((w) => w.id))
    const fresh = shuffle(bank.words.filter((w) => !progress[w.id]).slice(0, newQuota).map((w) => w.id))
    const q = [...reviews, ...fresh].map((id) => ({ id, retry: false }))
    if (!q.length) return toast('今天没有到期的复习，也没有可学的新词', 'info')
    setQueue(q)
    setIdx(0)
    setRevealed(false)
    setStats({ new: 0, review: 0, ok: 0 })
  }

  if (!bank) {
    return (
      <Empty icon="book" text="还没有词库：先到上方「词库管理」导入一个（支持 txt / csv / json），再回来开始学习" />
    )
  }

  if (!queue) {
    return (
      <div>
        <Card className="mt12" title={`今日任务 · ${bank.name}`}>
          <div className="grid3">
            <div className="stat"><div className="stat-value">{dueCount}</div><div className="stat-sub">待复习（按艾宾浩斯到期）</div></div>
            <div className="stat"><div className="stat-value">{Math.min(newQuota, newCount)}</div><div className="stat-sub">今日可学新词</div></div>
            <div className="stat">
              <div className="stat-value">{newToday}</div>
              <div className="stat-sub">今日已学新词</div>
              <div className="row mt8">
                <span className="field-hint">每日新词</span>
                <input className="input" style={{ width: 70 }} type="number" min={1} max={100} value={dailyNew} onChange={(e) => setDailyNew(+e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mt16">
            <Button size="lg" icon="play" onClick={start} disabled={dueCount === 0 && Math.min(newQuota, newCount) === 0}>开始学习</Button>
          </div>
        </Card>
        <div className="mt16">
          <Card title="记忆规则">
            <div className="md-body">
              <ul>
                <li>点「认识」→ 按艾宾浩斯间隔 <strong>{EBBS.join(' → ')}</strong> 天后再次出现</li>
                <li>点「模糊」→ 保持当前等级，明天再见</li>
                <li>点「不认识」→ 回到第 0 级，10 分钟后在本轮再出现一次</li>
                <li>点单词卡上的 🔊 可以听发音</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (idx >= queue.length) {
    return (
      <Card className="mt12" title="本轮完成 🎉">
        <div className="grid3">
          <div className="stat"><div className="stat-value">{stats.new}</div><div className="stat-sub">新学</div></div>
          <div className="stat"><div className="stat-value">{stats.review}</div><div className="stat-sub">复习</div></div>
          <div className="stat"><div className="stat-value">{stats.new + stats.review > 0 ? Math.round((stats.ok / (stats.new + stats.review)) * 100) : 0}%</div><div className="stat-sub">一次点「认识」的比例</div></div>
        </div>
        <div className="row mt16">
          <Button icon="play" onClick={start}>再来一轮</Button>
          <Button variant="ghost" onClick={() => setQueue(null)}>返回任务页</Button>
        </div>
      </Card>
    )
  }

  const item = queue[idx]
  const word = bank.words.find((w) => w.id === item.id)
  if (!word) return null
  const prog = progress[word.id]

  const doGrade = (g: 0 | 1 | 2) => {
    grade(word.id, g)
    if (g === 2) setStats((s) => ({ ...s, ok: s.ok + 1 }))
    if (!prog) setStats((s) => ({ ...s, new: s.new + 1 }))
    else setStats((s) => ({ ...s, review: s.review + 1 }))
    let nextQ = queue
    if (g === 0 && !item.retry) nextQ = [...queue, { id: word.id, retry: true }]
    setQueue(nextQ)
    setIdx(idx + 1)
    setRevealed(false)
  }

  return (
    <div>
      <div className="row mt12" style={{ justifyContent: 'space-between' }}>
        <span className="field-hint">{idx + 1} / {queue.length}{item.retry ? ' · 刚才不会，再试一次' : ''}</span>
        <button className="icon-btn" title="放弃本轮" onClick={() => setQueue(null)}><Icon name="x" size={16} /></button>
      </div>
      <ProgressBar value={(idx / queue.length) * 100} />

      <div className={`fc-scene mt16 ${revealed ? 'flipped' : ''}`} onClick={() => !revealed && setRevealed(true)}>
        <div className="fc">
          <div className="fc-face fc-front">
            <div className="fc-term">{word.term}</div>
            {word.phonetic && <div className="fc-phonetic">{word.phonetic}</div>}
            <button
              className="icon-btn fc-speak"
              title="朗读"
              onClick={(e) => {
                e.stopPropagation()
                speak(word.term)
              }}
            >
              <Icon name="volume" size={20} />
            </button>
            {!revealed && <div className="fc-hint">点击卡片显示释义</div>}
          </div>
          <div className="fc-face fc-back">
            <div className="fc-def">{word.definition}</div>
          </div>
        </div>
      </div>

      {revealed && (
        <div className="row grade-row">
          <Button size="lg" variant="danger" onClick={() => doGrade(0)}>不认识</Button>
          <Button size="lg" variant="soft" onClick={() => doGrade(1)}>模糊</Button>
          <Button size="lg" onClick={() => doGrade(2)}>认识</Button>
        </div>
      )}
      <div className="field-hint mt8" style={{ textAlign: 'center' }}>当前等级：{prog ? `第 ${prog.box + 1} 级` : '新词'} · 累计见过 {prog?.seen ?? 0} 次</div>
    </div>
  )
}

/* ---------- 词库管理 ---------- */

function BanksTab() {
  const banks = useVocab((s) => s.banks)
  const progress = useVocab((s) => s.progress)
  const activeBankId = useVocab((s) => s.activeBankId)
  const setActive = useVocab((s) => s.setActive)
  const addBank = useVocab((s) => s.addBank)
  const removeBank = useVocab((s) => s.removeBank)
  const resetProgress = useVocab((s) => s.resetProgress)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [step, setStep] = useState<'paste' | 'ai'>('paste')

  const doImport = () => {
    const words = parseWordBank(text)
    if (!words.length) return toast('没有解析出单词：请检查格式（每行「单词 释义」）', 'err')
    addBank(name || '我的词库', words)
    toast(`成功导入 ${words.length} 个词`, 'ok')
    setOpen(false)
    setName('')
    setText('')
  }

  const aiExtract = async () => {
    if (!aiText.trim()) return toast('请先粘贴文章', 'err')
    setAiBusy(true)
    try {
      const out = await chat(
        [
          { role: 'system', content: '你是词汇摘录助手。从用户提供的文章中挑选 8~20 个值得学习的中/高级词汇（生僻但常用、考试高频），输出 JSON 数组：[{"term":"单词","definition":"中文释义（含词性）"}]，不要输出其他内容。' },
          { role: 'user', content: aiText.slice(0, 12000) },
        ],
        { temperature: 0.2 }
      )
      const arr = extractJson<{ term: string; definition: string }[]>(out)
      if (!Array.isArray(arr) || !arr.length) throw new Error('未提取到词汇')
      addBank(name || `AI 摘词 ${todayKey()}`, arr)
      toast(`AI 摘出 ${arr.length} 个词，已建词库`, 'ok')
      setOpen(false)
      setAiText('')
      setName('')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div>
      <div className="row mt12">
        <Button icon="plus" onClick={() => setOpen(true)}>导入 / 新建词库</Button>
        {aiConfigured() && (
          <Button variant="soft" icon="sparkles" onClick={() => { setStep('ai'); setOpen(true) }}>AI 从文章摘词</Button>
        )}
      </div>

      {banks.length === 0 ? (
        <Empty icon="book" text="还没有词库，点击上方按钮导入（内置示例词库丢失了也可以重新导入）" />
      ) : (
        <div className="mt16">
          {banks.map((b) => {
            const learned = b.words.filter((w) => progress[w.id]).length
            return (
              <Card key={b.id} className={`bank-item ${b.id === activeBankId ? 'active' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div className="note-title">{b.name} {b.id === activeBankId && <Tag color="green">当前使用</Tag>}</div>
                    <div className="field-hint">共 {b.words.length} 词 · 已学 {learned} · 未学 {b.words.length - learned}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {b.id !== activeBankId && <Button size="sm" variant="soft" onClick={() => setActive(b.id)}>使用</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm(`重置「${b.name}」的学习进度？`)) { resetProgress(b.id); toast('进度已重置', 'ok') } }}>重置进度</Button>
                    <Button size="sm" variant="danger" icon="trash" onClick={() => { if (confirm(`删除词库「${b.name}」及其进度？`)) removeBank(b.id) }}>删除</Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="导入词库">
        <div className="row" style={{ gap: 8 }}>
          <button className={`chip ${step === 'paste' ? 'active' : ''}`} onClick={() => setStep('paste')}>粘贴 / 文件</button>
          <button className={`chip ${step === 'ai' ? 'active' : ''}`} onClick={() => setStep('ai')}>AI 从文章摘词</button>
        </div>
        <Field label="词库名称">
          <input className="input" placeholder="如：六级核心词" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {step === 'paste' ? (
          <>
            <Field label="词库内容" hint="每行一个词，支持「单词 释义」「单词,释义」「单词	释义」，也支持 JSON 数组">
              <textarea className="input" rows={10} placeholder={'abandon  v. 放弃\naccess  n. 通道；获取'} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <label className="btn btn-ghost btn-md" style={{ marginBottom: 12 }}>
              <Icon name="upload" size={16} />
              <span>从 .txt / .csv / .json 读取</span>
              <input
                type="file"
                accept=".txt,.csv,.json,.tsv"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const t = await readTextFile(f)
                  setText(t)
                  if (!name) setName(f.name.replace(/\.\w+$/, ''))
                }}
              />
            </label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button icon="check" onClick={doImport}>导入</Button>
            </div>
          </>
        ) : (
          <>
            <Field label="粘贴一篇英文文章" hint="AI 会挑出值得背的生词建一个新词库">
              <textarea className="input" rows={10} placeholder="粘贴英语阅读文章…" value={aiText} onChange={(e) => setAiText(e.target.value)} />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button icon="sparkles" onClick={aiExtract} disabled={aiBusy}>{aiBusy ? <><Spinner /> 提取中…</> : 'AI 摘词'}</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

/* ---------- 学习记录 ---------- */

function StatsTab() {
  const banks = useVocab((s) => s.banks)
  const progress = useVocab((s) => s.progress)
  const log = useVocab((s) => s.log)

  const total = banks.reduce((a, b) => a + b.words.length, 0)
  const learned = Object.keys(progress).length
  const now = Date.now()
  const due = Object.values(progress).filter((p) => p.due <= now).length
  const mastered = Object.values(progress).filter((p) => p.box >= 4).length

  const streak = useMemo(() => {
    let s = 0
    for (let i = 0; i < 365; i++) {
      const key = todayKey(new Date(Date.now() - i * 86400000))
      const day = log[key]
      if (day && day.new + day.review > 0) s++
      else if (i > 0) break
    }
    return s
  }, [log])

  const chart = useMemo(
    () =>
      lastNDays(14).map((key) => {
        const day = log[key]
        const v = day ? day.new + day.review : 0
        return { label: weekdayLabel(key), value: v, tip: `${key}：新学 ${day?.new ?? 0} · 复习 ${day?.review ?? 0}` }
      }),
    [log]
  )

  return (
    <div>
      <div className="grid3 mt12">
        <div className="card stat"><div className="stat-value">{total}</div><div className="stat-sub">词库总词数</div></div>
        <div className="card stat"><div className="stat-value">{learned}</div><div className="stat-sub">已学过（见过至少一次）</div></div>
        <div className="card stat"><div className="stat-value">{due}</div><div className="stat-sub">当前待复习</div></div>
        <div className="card stat"><div className="stat-value">{mastered}</div><div className="stat-sub">较熟词（≥5级）</div></div>
        <div className="card stat"><div className="stat-value">{streak} 天</div><div className="stat-sub">连续打卡</div></div>
        <div className="card stat"><div className="stat-value">{Object.values(log).reduce((a, b) => a + b.new + b.review, 0)}</div><div className="stat-sub">累计学习次数</div></div>
      </div>
      <div className="mt16">
        <Card title="近 14 天学习量（新学 + 复习）">
          <BarChart data={chart} unit="词" />
        </Card>
      </div>
    </div>
  )
}

export default function Vocab() {
  const [tab, setTab] = useState('study')
  return (
    <div>
      <h1 className="page-title">背单词</h1>
      <p className="page-sub">导入词库 · 每日新词 + 艾宾浩斯复习 · 点卡自测</p>
      <div className="mt12">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      <div className="mt16">
        {tab === 'study' && <StudyTab />}
        {tab === 'banks' && <BanksTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </div>
  )
}
