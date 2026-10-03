import { useMemo } from 'react'
import { Card, Button, BarChart, Tag } from '../components/ui'
import { usePomo } from '../store/pomoEngine'
import { usePomodoro } from '../store/pomodoro'
import { useSettings } from '../store/settings'
import { fmtMMSS, todayKey, lastNDays, weekdayLabel } from '../lib/util'

const R = 100
const CIRC = 2 * Math.PI * R

export default function Pomodoro() {
  const p = usePomo()
  const sessions = usePomodoro((s) => s.sessions)
  const pomo = useSettings((s) => s.pomo)
  const setPomo = useSettings((s) => s.setPomo)

  const pct = 1 - p.remain / Math.max(1, p.total)
  const modeName = p.mode === 'focus' ? '专注' : p.mode === 'short' ? '短休息' : '长休息'

  const today = todayKey()
  const todaySessions = sessions.filter((s) => todayKey(s.start) === today)
  const todayMin = todaySessions.reduce((a, b) => a + b.minutes, 0)

  const weekData = useMemo(
    () =>
      lastNDays(7).map((key) => {
        const min = sessions.filter((s) => todayKey(s.start) === key).reduce((a, b) => a + b.minutes, 0)
        return { label: weekdayLabel(key), value: min, tip: `${key} 专注 ${min} 分钟` }
      }),
    [sessions]
  )

  return (
    <div>
      <h1 className="page-title">番茄钟</h1>
      <p className="page-sub">专注 25 分钟，休息 5 分钟；每 {pomo.longEvery} 轮一次长休息（可在设置中调整）</p>

      <div className="pomo-wrap card">
        <div className="pomo-modes">
          {(['focus', 'short', 'long'] as const).map((m) => (
            <button key={m} className={`mode-chip ${p.mode === m ? 'active' : ''}`} onClick={() => p.switchMode(m)}>
              {m === 'focus' ? '专注' : m === 'short' ? '短休息' : '长休息'}
            </button>
          ))}
        </div>

        <div className="pomo-ring">
          <svg width="240" height="240" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r={R} stroke="#eef0f5" strokeWidth="12" fill="none" />
            <circle
              cx="120"
              cy="120"
              r={R}
              stroke="url(#pomoGrad)"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * pct}
              transform="rotate(-90 120 120)"
              style={{ transition: 'stroke-dashoffset .3s linear' }}
            />
            <defs>
              <linearGradient id="pomoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" className="grad-a" />
                <stop offset="100%" className="grad-b" />
              </linearGradient>
            </defs>
          </svg>
          <div className="pomo-center">
            <div className={`pomo-time ${p.running ? 'run' : ''}`}>{fmtMMSS(p.remain)}</div>
            <div className="pomo-mode-name">{p.running ? modeName + '中…' : modeName}</div>
          </div>
        </div>

        <input
          className="input pomo-label"
          placeholder="这颗番茄用来做什么？（如：数学 · 刷第 3 章）"
          value={p.label}
          onChange={(e) => p.setLabel(e.target.value)}
        />

        <div className="row mt16" style={{ justifyContent: 'center', gap: 12 }}>
          {p.running ? (
            <Button size="lg" icon="pause" onClick={p.pause}>暂停</Button>
          ) : (
            <Button size="lg" icon="play" onClick={p.start}>开始</Button>
          )}
          <Button size="lg" variant="ghost" icon="reset" onClick={p.reset}>重置</Button>
        </div>

        <div className="cycle-dots">
          {Array.from({ length: pomo.longEvery }).map((_, i) => (
            <span key={i} className={`cycle-dot ${i < p.cycle % pomo.longEvery || (p.cycle > 0 && p.cycle % pomo.longEvery === 0) ? 'filled' : ''}`} />
          ))}
          <span className="field-hint">本轮第 {p.cycle % pomo.longEvery || pomo.longEvery} / {pomo.longEvery} 个番茄</span>
        </div>
      </div>

      <div className="grid2 mt16">
        <Card title="今日成果">
          <div className="stat-value">{todayMin} 分钟</div>
          <div className="field-hint mt8">完成 {todaySessions.length} 颗番茄{todaySessions.length ? '：' + todaySessions.slice(-3).map((s) => s.label || '未命名').join('、') : ''}</div>
        </Card>
        <Card title="近 7 天专注（分钟）">
          <BarChart data={weekData} unit="分钟" />
        </Card>
      </div>

      <div className="mt16">
        <Card title="计时设置" extra={<Tag color="gray">修改立即生效，下次切换模式时应用</Tag>}>
          <div className="grid3">
            <label className="field">
              <span className="field-label">专注（分钟）</span>
              <input className="input" type="number" min={1} max={120} value={pomo.focusMin} onChange={(e) => setPomo({ focusMin: Math.max(1, +e.target.value || 25) })} />
            </label>
            <label className="field">
              <span className="field-label">短休息（分钟）</span>
              <input className="input" type="number" min={1} max={30} value={pomo.shortMin} onChange={(e) => setPomo({ shortMin: Math.max(1, +e.target.value || 5) })} />
            </label>
            <label className="field">
              <span className="field-label">长休息（分钟）</span>
              <input className="input" type="number" min={1} max={60} value={pomo.longMin} onChange={(e) => setPomo({ longMin: Math.max(1, +e.target.value || 15) })} />
            </label>
          </div>
        </Card>
      </div>
    </div>
  )
}
