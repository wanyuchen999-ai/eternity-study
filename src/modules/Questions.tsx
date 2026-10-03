import { useMemo, useState } from 'react'
import { Card, Tabs, Button, Empty, Tag, Modal, Field, ProgressBar, Spinner } from '../components/ui'
import { Icon } from '../components/Icon'
import { useQuestions, QTYPE_LABEL, type Question, type QType } from '../store/questions'
import { chat, extractJson, imageURLContent, aiConfigured, type ContentPart } from '../lib/ai'
import { fileToDataURL } from '../lib/image'
import { toast } from '../store/ui'
import { shuffle } from '../lib/util'

const TABS = [
  { key: 'capture', label: '智能录题' },
  { key: 'practice', label: '练习' },
  { key: 'wrong', label: '错题本' },
]

const OCR_PROMPT =
  '你是题目数字化助手。识别用户提供的图片/文本中的所有题目，整理成 JSON 数组输出，不要输出任何其他内容。' +
  '每题字段：type（"single"单选/"multiple"多选/"judge"判断/"fill"填空/"short"简答）、stem（题干，保留题号）、' +
  'options（选择题才有，数组 [{"key":"A","text":"选项内容"}]）、answer（选择题填选项字母如"B"；判断题填"对"或"错"；填空题填答案；简答题给参考答案要点）、' +
  'explanation（解析，没有就空字符串）、subject（能判断学科就填，否则空字符串）。忠实转录，不要自己改题。'

type DraftQ = Omit<Question, 'id' | 'createdAt' | 'wrongCount' | 'lastWrongAt' | 'mastered'>

function normalize(raw: unknown, source: 'ocr' | 'text'): DraftQ {
  const o = (raw ?? {}) as Record<string, unknown>
  let type = String(o.type ?? 'single').toLowerCase() as QType
  if (!['single', 'multiple', 'judge', 'fill', 'short'].includes(type)) type = 'single'
  const stem = String(o.stem ?? o.question ?? '').trim()
  if (/判断/.test(stem) && type === 'single') type = 'judge'
  const opts = Array.isArray(o.options)
    ? o.options.map((x: unknown) => {
        const p = (x ?? {}) as Record<string, unknown>
        return { key: String(p.key ?? ''), text: String(p.text ?? '') }
      })
    : undefined
  return {
    type,
    stem,
    options: opts && opts.length ? opts : undefined,
    answer: String(o.answer ?? '').trim(),
    explanation: String(o.explanation ?? '').trim(),
    subject: String(o.subject ?? '').trim(),
    source,
  }
}

/* ---------- 智能录题 ---------- */

function CaptureTab() {
  const addMany = useQuestions((s) => s.addMany)
  const [mode, setMode] = useState<'image' | 'text' | 'manual'>('image')
  const [images, setImages] = useState<string[]>([])
  const [rawText, setRawText] = useState('')
  const [drafts, setDrafts] = useState<DraftQ[]>([])
  const [busy, setBusy] = useState(false)

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    const urls: string[] = []
    for (const f of Array.from(files).slice(0, 5)) urls.push(await fileToDataURL(f))
    setImages((im) => [...im, ...urls].slice(0, 6))
  }

  const recognize = async () => {
    setBusy(true)
    setDrafts([])
    try {
      let out: string
      if (mode === 'image') {
        if (!images.length) throw new Error('请先上传题目图片')
        const parts: ContentPart[] = [{ type: 'text', text: OCR_PROMPT }, ...images.map(imageURLContent)]
        out = await chat([{ role: 'user', content: parts }], { model: useVisionModel(), temperature: 0.1 })
      } else {
        if (!rawText.trim()) throw new Error('请先粘贴题目文本')
        out = await chat(
          [
            { role: 'system', content: OCR_PROMPT },
            { role: 'user', content: rawText },
          ],
          { temperature: 0.1 }
        )
      }
      const arr = extractJson<unknown[]>(out)
      if (!Array.isArray(arr) || !arr.length) throw new Error('没有识别到题目')
      setDrafts(arr.map((r) => normalize(r, mode === 'image' ? 'ocr' : 'text')))
      toast(`识别到 ${arr.length} 道题，请核对后保存`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const saveAll = () => {
    const valid = drafts.filter((d) => d.stem.trim())
    if (!valid.length) return toast('没有可保存的题目', 'err')
    addMany(valid)
    toast(`已保存 ${valid.length} 道题到题库`, 'ok')
    setDrafts([])
    setImages([])
    setRawText('')
  }

  const patch = (i: number, p: Partial<DraftQ>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)))

  // 手动添加
  const [mType, setMType] = useState<QType>('single')
  const [mStem, setMStem] = useState('')
  const [mOpts, setMOpts] = useState<string[]>(['', '', '', ''])
  const [mAns, setMAns] = useState('')
  const [mSub, setMSub] = useState('')
  const [mExp, setMExp] = useState('')
  const manualSave = () => {
    if (!mStem.trim()) return toast('请填写题干', 'err')
    addMany([
      {
        type: mType,
        stem: mStem.trim(),
        options: mType === 'single' || mType === 'multiple' ? mOpts.map((t, i) => ({ key: 'ABCD'[i], text: t })).filter((o) => o.text) : undefined,
        answer: mAns.trim(),
        explanation: mExp.trim(),
        subject: mSub.trim(),
        source: 'manual',
      },
    ])
    toast('已添加到题库', 'ok')
    setMStem('')
    setMOpts(['', '', '', ''])
    setMAns('')
    setMExp('')
  }

  return (
    <div>
      {!aiConfigured() && (
        <div className="ai-warn">
          <Icon name="zap" size={15} /> 智能录题需要 AI：请先到 <a href="#/settings">设置</a> 配置（图片识别需要支持视觉的模型）
        </div>
      )}
      <div className="row mt12" style={{ gap: 8 }}>
        {(
          [
            ['image', '图片识别'],
            ['text', '文本解析'],
            ['manual', '手动添加'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={`chip ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'image' && (
        <Card className="mt12" title="上传题目图片（截图/拍照，一次最多 6 张）">
          <label className="upload-area">
            <Icon name="image" size={26} />
            <span>点击选择图片</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
          </label>
          {images.length > 0 && (
            <div className="img-grid mt12">
              {images.map((src, i) => (
                <div key={i} className="img-thumb">
                  <img src={src} alt={`题目图${i + 1}`} />
                  <button className="icon-btn img-del" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt12">
            <Button icon="sparkles" onClick={recognize} disabled={busy || !images.length}>
              {busy ? <><Spinner /> 识别中，约需十几秒…</> : 'AI 识别题目'}
            </Button>
          </div>
        </Card>
      )}

      {mode === 'text' && (
        <Card className="mt12" title="粘贴题目文本">
          <textarea className="input" rows={8} placeholder={'1. 力的单位是____\n2. 判断：重力方向竖直向下（  ）\n…'} value={rawText} onChange={(e) => setRawText(e.target.value)} />
          <div className="mt12">
            <Button icon="sparkles" onClick={recognize} disabled={busy || !rawText.trim()}>
              {busy ? <><Spinner /> 解析中…</> : 'AI 解析为结构化题目'}
            </Button>
          </div>
        </Card>
      )}

      {mode === 'manual' && (
        <Card className="mt12" title="手动添加题目">
          <div className="grid2">
            <Field label="题型">
              <select className="input" value={mType} onChange={(e) => setMType(e.target.value as QType)}>
                {Object.entries(QTYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="科目（可选）">
              <input className="input" value={mSub} onChange={(e) => setMSub(e.target.value)} placeholder="如：物理" />
            </Field>
          </div>
          <Field label="题干">
            <textarea className="input" rows={3} value={mStem} onChange={(e) => setMStem(e.target.value)} />
          </Field>
          {(mType === 'single' || mType === 'multiple') && (
            <div className="grid2">
              {mOpts.map((o, i) => (
                <Field key={i} label={`选项 ${'ABCD'[i]}`}>
                  <input className="input" value={o} onChange={(e) => setMOpts(mOpts.map((x, j) => (j === i ? e.target.value : x)))} />
                </Field>
              ))}
            </div>
          )}
          <div className="grid2">
            <Field label={mType === 'judge' ? '答案（对/错）' : '答案'}>
              {mType === 'judge' ? (
                <select className="input" value={mAns} onChange={(e) => setMAns(e.target.value)}>
                  <option value="">请选择</option>
                  <option value="对">对</option>
                  <option value="错">错</option>
                </select>
              ) : (
                <input className="input" value={mAns} onChange={(e) => setMAns(e.target.value)} placeholder={mType === 'single' ? 'A' : mType === 'multiple' ? 'AB' : '答案内容'} />
              )}
            </Field>
            <Field label="解析（可选）">
              <input className="input" value={mExp} onChange={(e) => setMExp(e.target.value)} />
            </Field>
          </div>
          <Button icon="plus" onClick={manualSave}>添加到题库</Button>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card className="mt16" title={`识别结果核对（${drafts.length} 题）`} extra={<Button size="sm" icon="check" onClick={saveAll}>全部存入题库</Button>}>
          {drafts.map((d, i) => (
            <div key={i} className="draft-item">
              <div className="row" style={{ gap: 8 }}>
                <select className="input" style={{ width: 90 }} value={d.type} onChange={(e) => patch(i, { type: e.target.value as QType })}>
                  {Object.entries(QTYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input className="input" style={{ width: 120 }} placeholder="科目" value={d.subject} onChange={(e) => patch(i, { subject: e.target.value })} />
                <button className="icon-btn" title="删除本题" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <textarea className="input mt8" rows={2} value={d.stem} onChange={(e) => patch(i, { stem: e.target.value })} />
              {d.options && d.options.length > 0 && (
                <div className="grid2 mt8">
                  {d.options.map((o, oi) => (
                    <div key={oi} className="row" style={{ gap: 6 }}>
                      <span className="field-hint">{o.key}</span>
                      <input
                        className="input"
                        value={o.text}
                        onChange={(e) => patch(i, { options: d.options!.map((x, j) => (j === oi ? { ...x, text: e.target.value } : x)) })}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="row mt8" style={{ gap: 8 }}>
                <input className="input" style={{ width: 200 }} placeholder="答案" value={d.answer} onChange={(e) => patch(i, { answer: e.target.value })} />
                <input className="input" placeholder="解析" value={d.explanation} onChange={(e) => patch(i, { explanation: e.target.value })} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// 视觉模型名从设置读取（避免整个模块重渲染）
import { useSettings } from '../store/settings'
const useVisionModel = () => useSettings.getState().ai.visionModel

/* ---------- 答题卡 ---------- */

function PracticeCard({ q, onResult }: { q: Question; onResult: (correct: boolean) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState<boolean | null>(null)
  const [showAns, setShowAns] = useState(false)

  const canSubmit =
    q.type === 'single' || q.type === 'judge'
      ? sel.length === 1
      : q.type === 'multiple'
        ? sel.length >= 1
        : q.type === 'fill'
          ? text.trim().length > 0
          : false

  const submit = () => {
    let ok = false
    if (q.type === 'single' || q.type === 'judge') ok = sel[0] === q.answer.replace(/[^对错A-Z]/g, '')
    else if (q.type === 'multiple') ok = [...sel].sort().join('') === q.answer.replace(/[^A-Z]/g, '').split('').sort().join('')
    else if (q.type === 'fill') {
      const norm = (s: string) => s.replace(/\s|，|,|。|；|;/g, '')
      ok = norm(text) === norm(q.answer) || norm(q.answer).split(/或|\/|or/).some((a) => a && norm(text) === norm(a))
    }
    setSubmitted(ok)
    onResult(ok)
  }

  const toggle = (k: string) =>
    setSel((s) => (q.type === 'multiple' ? (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]) : [k]))

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Tag color="indigo">{QTYPE_LABEL[q.type]}</Tag>
        {q.subject && <Tag color="gray">{q.subject}</Tag>}
      </div>
      <div className="q-stem">{q.stem}</div>

      {(q.type === 'single' || q.type === 'multiple' || q.type === 'judge') && (
        <div className="mt12">
          {(q.type === 'judge'
            ? [
                { key: '对', text: '正确' },
                { key: '错', text: '错误' },
              ]
            : q.options ?? []
          ).map((o) => {
            const chosen = sel.includes(o.key)
            const isAns = submitted !== null && (q.type === 'multiple' ? q.answer.includes(o.key) : o.key === q.answer.replace(/[^对错]/g, ''))
            const isWrongPick = submitted === false && chosen && !isAns
            return (
              <button
                key={o.key}
                className={`opt ${chosen ? 'sel' : ''} ${isAns ? 'ok' : ''} ${isWrongPick ? 'bad' : ''}`}
                onClick={() => submitted === null && toggle(o.key)}
                disabled={submitted !== null}
              >
                <b>{o.key}.</b> {o.text}
              </button>
            )
          })}
        </div>
      )}

      {q.type === 'fill' && (
        <input className="input mt12" placeholder="填写答案" value={text} onChange={(e) => setText(e.target.value)} disabled={submitted !== null} />
      )}

      {q.type === 'short' && (
        <div className="mt12">
          <textarea className="input" rows={4} placeholder="先自己作答（或默背），再对照参考答案" value={text} onChange={(e) => setText(e.target.value)} disabled={submitted !== null} />
          {!showAns && submitted === null && (
            <Button variant="soft" className="mt8" onClick={() => setShowAns(true)}>显示参考答案</Button>
          )}
          {showAns && submitted === null && (
            <div className="answer-box">
              <div className="answer-title">参考答案</div>
              <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtmlSafe(q.answer) }} />
            </div>
          )}
        </div>
      )}

      {(submitted !== null || showAns) && (q.type !== 'short' || submitted !== null) && (
        <div className="answer-box mt12">
          <div className="answer-title">
            {submitted === null ? '参考答案' : submitted ? '✅ 回答正确' : '❌ 回答错误'}
          </div>
          <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtmlSafe(q.answer) }} />
          {q.explanation && (
            <>
              <div className="answer-title mt8">解析</div>
              <div className="md-body" dangerouslySetInnerHTML={{ __html: mdToHtmlSafe(q.explanation) }} />
            </>
          )}
        </div>
      )}

      {submitted === null && q.type !== 'short' && (
        <Button className="mt12" onClick={submit} disabled={!canSubmit}>提交答案</Button>
      )}
      {submitted === null && q.type === 'short' && showAns && (
        <div className="row mt12">
          <span className="field-hint">对照答案，诚实地评一评：</span>
          <Button variant="danger" size="sm" onClick={() => { setSubmitted(false); onResult(false) }}>答错了</Button>
          <Button size="sm" onClick={() => { setSubmitted(true); onResult(true) }}>答对了</Button>
        </div>
      )}
    </div>
  )
}

import { mdToHtml } from '../lib/md'
const mdToHtmlSafe = (s: string) => mdToHtml(s || '')

/* ---------- 练习会话 ---------- */

function PracticeSession({ ids, onExit }: { ids: string[]; onExit: () => void }) {
  const questions = useQuestions((s) => s.questions)
  const record = useQuestions((s) => s.recordAttempt)
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const q = questions.find((x) => x.id === ids[idx])

  if (!q) {
    const ok = results.filter(Boolean).length
    return (
      <Card className="mt12" title="本轮练习完成 🎯">
        <div className="stat-value">{ids.length ? Math.round((ok / Math.max(1, ids.length)) * 100) : 0} 分</div>
        <div className="field-hint mt8">答对 {ok} / {ids.length} 题，错题已自动进入错题本</div>
        <div className="row mt12">
          <Button onClick={onExit}>返回</Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mt12">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="field-hint">第 {idx + 1} / {ids.length} 题</span>
        <button className="icon-btn" onClick={onExit} title="结束练习"><Icon name="x" size={16} /></button>
      </div>
      <ProgressBar value={(idx / Math.max(1, ids.length)) * 100} />
      <div className="mt12" key={q.id}>
        <PracticeCard
          q={q}
          onResult={(c) => {
            record(q.id, c)
            setResults((r) => [...r, c])
          }}
        />
      </div>
      {results.length > idx && (
        <div className="row mt16">
          <Button
            icon="chevronRight"
            onClick={() => setIdx(idx + 1)}
          >
            {idx + 1 >= ids.length ? '查看结果' : '下一题'}
          </Button>
        </div>
      )}
    </Card>
  )
}

/* ---------- 练习页 ---------- */

function PracticeTab() {
  const questions = useQuestions((s) => s.questions)
  const attempts = useQuestions((s) => s.attempts)
  const [subject, setSubject] = useState('全部')
  const [type, setType] = useState<'全部' | QType>('全部')
  const [onlyWrong, setOnlyWrong] = useState(false)
  const [session, setSession] = useState<string[] | null>(null)

  const subjects = useMemo(() => Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))) as string[], [questions])

  const filtered = questions.filter(
    (q) =>
      (subject === '全部' || q.subject === subject) &&
      (type === '全部' || q.type === type) &&
      (!onlyWrong || ((q.wrongCount ?? 0) > 0 && !q.mastered))
  )

  const start = () => {
    if (!filtered.length) return toast('没有符合筛选的题目', 'err')
    setSession(shuffle(filtered.map((q) => q.id)).slice(0, 30))
  }

  const acc = attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : 0

  if (session) return <PracticeSession ids={session} onExit={() => setSession(null)} />

  return (
    <div>
      <div className="grid3 mt12">
        <div className="card stat"><div className="stat-value">{questions.length}</div><div className="stat-sub">题库总题数</div></div>
        <div className="card stat"><div className="stat-value">{attempts.length}</div><div className="stat-sub">累计刷题次数</div></div>
        <div className="card stat"><div className="stat-value">{acc}%</div><div className="stat-sub">总正确率</div></div>
      </div>

      {questions.length === 0 ? (
        <Empty icon="layers" text="题库还是空的：先到「智能录题」添加题目（图片识别 / 文本解析 / 手动录入都可以）" />
      ) : (
        <Card className="mt16" title="开始一轮练习">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 140 }} value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="全部">全部科目</option>
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="input" style={{ width: 120 }} value={type} onChange={(e) => setType(e.target.value as '全部' | QType)}>
              <option value="全部">全部题型</option>
              {Object.entries(QTYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} />
              <span className="field-hint">只练错题</span>
            </label>
            <span className="field-hint">{filtered.length} 题符合条件</span>
          </div>
          <div className="mt12">
            <Button size="lg" icon="play" onClick={start} disabled={!filtered.length}>开始练习（随机 30 题内）</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ---------- 错题本 ---------- */

function WrongTab() {
  const questions = useQuestions((s) => s.questions)
  const toggleMastered = useQuestions((s) => s.toggleMastered)
  const [redo, setRedo] = useState<string | null>(null)
  const [session, setSession] = useState<string[] | null>(null)

  const wrong = questions
    .filter((q) => (q.wrongCount ?? 0) > 0 && !q.mastered)
    .sort((a, b) => (b.lastWrongAt ?? 0) - (a.lastWrongAt ?? 0))

  if (session) return <PracticeSession ids={session} onExit={() => setSession(null)} />

  return (
    <div>
      {redo && (
        <Card className="mt12" title="重做本题" extra={<Button size="sm" variant="ghost" onClick={() => setRedo(null)}>收起</Button>}>
          <PracticeCard
            q={questions.find((x) => x.id === redo)!}
            onResult={(c) => useQuestions.getState().recordAttempt(redo, c)}
          />
        </Card>
      )}

      <div className="row mt12">
        <Button
          icon="play"
          disabled={!wrong.length}
          onClick={() => setSession(shuffle(wrong.map((q) => q.id)).slice(0, 20))}
        >
          练习全部错题（{wrong.length}）
        </Button>
      </div>

      {wrong.length === 0 ? (
        <Empty icon="check" text="错题本空空如也，保持住！做错的题会自动出现在这里" />
      ) : (
        <div className="mt16">
          {wrong.map((q) => (
            <Card key={q.id} className="wrong-item">
              <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                <Tag color="indigo">{QTYPE_LABEL[q.type]}</Tag>
                {q.subject && <Tag color="gray">{q.subject}</Tag>}
                <Tag color="red">错 {q.wrongCount} 次</Tag>
              </div>
              <div className="q-stem">{q.stem.length > 120 ? q.stem.slice(0, 120) + '…' : q.stem}</div>
              <div className="row mt8" style={{ gap: 8 }}>
                <Button size="sm" variant="soft" icon="reset" onClick={() => setRedo(q.id)}>重做</Button>
                <Button size="sm" variant="ghost" icon="checkmark" onClick={() => toggleMastered(q.id)}>标记已掌握</Button>
                <span className="field-hint ml-auto">{q.lastWrongAt ? `最近答错 ${new Date(q.lastWrongAt).toLocaleDateString()}` : ''}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Questions() {
  const [tab, setTab] = useState('capture')
  return (
    <div>
      <h1 className="page-title">题库</h1>
      <p className="page-sub">拍照录题 → 建题库 → 刷题 → 错题自动收集</p>
      <div className="mt12">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      <div className="mt16">
        {tab === 'capture' && <CaptureTab />}
        {tab === 'practice' && <PracticeTab />}
        {tab === 'wrong' && <WrongTab />}
      </div>
    </div>
  )
}
