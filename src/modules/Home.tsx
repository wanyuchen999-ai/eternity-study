import { useMemo, useState } from 'react'
import { Card, StatCard, BarChart, Button, Empty, ProgressBar, Tag } from '../components/ui'
import { Icon } from '../components/Icon'
import { useSettings } from '../store/settings'
import { usePomodoro } from '../store/pomodoro'
import { useTodos } from '../store/todos'
import { useVocab } from '../store/vocab'
import { useQuestions } from '../store/questions'
import { useExams } from '../store/exams'
import { todayKey, lastNDays, weekdayLabel, daysUntil } from '../lib/util'
import { getCurrentUser } from '../lib/profileStorage'

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了，注意休息'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export default function Home() {
  const profileName = getCurrentUser()?.name ?? ''
  const userName = useSettings((s) => s.userName) || profileName
  const dailyGoal = useSettings((s) => s.pomo.dailyGoal)
  const sessions = usePomodoro((s) => s.sessions)
  const todos = useTodos((s) => s.todos)
  const toggleTodo = useTodos((s) => s.toggle)
  const addTodo = useTodos((s) => s.add)
  const banks = useVocab((s) => s.banks)
  const progress = useVocab((s) => s.progress)
  const activeBankId = useVocab((s) => s.activeBankId)
  const vocabLog = useVocab((s) => s.log)
  const dailyNew = useVocab((s) => s.dailyNew)
  const questions = useQuestions((s) => s.questions)
  const attempts = useQuestions((s) => s.attempts)
  const exams = useExams((s) => s.exams)
  const addExam = useExams((s) => s.add)
  const removeExam = useExams((s) => s.remove)

  const today = todayKey()
  const todaySessions = sessions.filter((s) => todayKey(s.start) === today)
  const todayMin = todaySessions.reduce((a, b) => a + b.minutes, 0)

  const [quickTodo, setQuickTodo] = useState('')
  const todayTodos = todos.filter((t) => !t.done && t.due && t.due <= today)

  const bank = banks.find((b) => b.id === activeBankId)
  const now = Date.now()
  const dueCount = bank ? bank.words.filter((w) => progress[w.id] && progress[w.id].due <= now).length : 0
  const newToday = vocabLog[today]?.new ?? 0

  const weekData = useMemo(() => {
    return lastNDays(7).map((key) => {
      const min = sessions.filter((s) => todayKey(s.start) === key).reduce((a, b) => a + b.minutes, 0)
      return { label: weekdayLabel(key), value: min, tip: `${key} 专注 ${min} 分钟` }
    })
  }, [sessions])

  const nearExams = [...exams].filter((e) => daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))
  const wrongCount = questions.filter((q) => (q.wrongCount ?? 0) > 0 && !q.mastered).length
  const accuracy = attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : 0

  const [examName, setExamName] = useState('')
  const [examDate, setExamDate] = useState('')

  return (
    <div>
      <h1 className="page-title">
        {greeting()}{userName ? `，${userName}` : ''}！
      </h1>
      <p className="page-sub">今天也要好好学习呀 · {today}</p>

      <div className="grid3 mt16">
        <StatCard icon="clock" label="今日专注" value={`${todayMin} 分钟`} sub={`${todaySessions.length} / ${dailyGoal} 个番茄`} onClick={() => (location.hash = '#/pomodoro')} />
        <StatCard icon="check" label="今日待办" value={`${todayTodos.length} 件待完成`} sub={`共 ${todos.filter((t) => !t.done).length} 件未完成`} onClick={() => (location.hash = '#/todos')} />
        <StatCard
          icon="book"
          label="背单词"
          value={dueCount > 0 ? `${dueCount} 词待复习` : newToday < dailyNew ? `今日可学新词 ${dailyNew - newToday} 个` : '今日任务完成'}
          sub={bank ? `词库：${bank.name}` : '尚未选择词库'}
          onClick={() => (location.hash = '#/vocab')}
        />
      </div>

      <div className="mt16">
        <Card title="本周专注时长（分钟）" extra={<Tag color="gray">累计 {sessions.reduce((a, b) => a + b.minutes, 0)} 分钟</Tag>}>
          <BarChart data={weekData} unit="分钟" />
          <div className="mt12">
            <ProgressBar value={(todayMin / Math.max(1, dailyGoal * 25)) * 100} />
            <div className="field-hint mt8">今日目标进度：{Math.round((todayMin / Math.max(1, dailyGoal * 25)) * 100)}%（按 {dailyGoal} × 25 分钟计）</div>
          </div>
        </Card>
      </div>

      <div className="grid2 mt16">
        <Card
          title="待办 · 今天"
          extra={<Button size="sm" variant="soft" icon="chevronRight" onClick={() => (location.hash = '#/todos')}>全部</Button>}
        >
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!quickTodo.trim()) return
              addTodo({ title: quickTodo, due: today })
              setQuickTodo('')
            }}
          >
            <input
              className="input"
              placeholder="快速添加今日待办，回车确认"
              value={quickTodo}
              onChange={(e) => setQuickTodo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!quickTodo.trim()) return
                  addTodo({ title: quickTodo, due: today })
                  setQuickTodo('')
                }
              }}
            />
          </form>
          <div className="mt12">
            {todayTodos.length === 0 ? (
              <div className="field-hint">今天没有到期任务 🎈</div>
            ) : (
              todayTodos.slice(0, 5).map((t) => (
                <div key={t.id} className="todo-item" onClick={() => toggleTodo(t.id)}>
                  <span className="cb" />
                  <span className="todo-title">{t.title}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="考试倒计时">
          {nearExams.length === 0 ? (
            <div className="field-hint">还没有考试安排，添加一个给自己一点紧迫感（笑）</div>
          ) : (
            nearExams.slice(0, 4).map((e) => {
              const d = daysUntil(e.date)
              return (
                <div key={e.id} className="exam-item">
                  <span className="todo-title">{e.name}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <Tag color={d <= 7 ? 'red' : d <= 30 ? 'amber' : 'gray'}>{d === 0 ? '就是今天！' : `剩 ${d} 天`}</Tag>
                    <button className="icon-btn" onClick={() => removeExam(e.id)} title="删除">
                      <Icon name="x" size={14} />
                    </button>
                  </span>
                </div>
              )
            })
          )}
          <form
            className="row mt12"
            onSubmit={(ev) => {
              ev.preventDefault()
              if (!examName.trim() || !examDate) return
              addExam(examName, examDate)
              setExamName('')
              setExamDate('')
            }}
          >
            <input
              className="input"
              style={{ flex: 2 }}
              placeholder="考试名称"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && examName.trim() && examDate) {
                  e.preventDefault()
                  addExam(examName, examDate)
                  setExamName('')
                  setExamDate('')
                }
              }}
            />
            <input className="input" style={{ flex: 1 }} type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            <Button size="sm" icon="plus" type="submit">添加</Button>
          </form>
        </Card>
      </div>

      <div className="grid3 mt16">
        <StatCard icon="layers" label="题库总题数" value={questions.length} sub={`刷题正确率 ${accuracy}%`} onClick={() => (location.hash = '#/questions')} />
        <StatCard icon="zap" label="待消灭错题" value={wrongCount} sub="在错题本里重做它们" onClick={() => (location.hash = '#/questions')} />
        <StatCard icon="book" label="词库数量" value={banks.length} sub={bank ? `当前 ${bank.words.length} 词` : '去导入一个词库吧'} onClick={() => (location.hash = '#/vocab')} />
      </div>

      {todos.length === 0 && questions.length <= 3 && banks.length <= 1 && (
        <div className="mt16">
          <Empty icon="sparkles" text="小提示：先去「设置」配置 AI 密钥，录音整理笔记、智能录题这些功能就能用啦">
            <Button size="sm" icon="settings" onClick={() => (location.hash = '#/settings')}>去设置</Button>
          </Empty>
        </div>
      )}
    </div>
  )
}
