import { useMemo, useState } from 'react'
import { Card, Button, Empty, Tag } from '../components/ui'
import { Icon } from '../components/Icon'
import { useTodos, type Todo } from '../store/todos'
import { todayKey } from '../lib/util'

const PRIO: Record<number, { label: string; color: 'red' | 'amber' | 'gray' }> = {
  2: { label: '高', color: 'red' },
  1: { label: '中', color: 'amber' },
  0: { label: '低', color: 'gray' },
}

type Filter = 'all' | 'today' | 'week' | 'done'

export default function Todos() {
  const todos = useTodos((s) => s.todos)
  const add = useTodos((s) => s.add)
  const toggle = useTodos((s) => s.toggle)
  const update = useTodos((s) => s.update)
  const remove = useTodos((s) => s.remove)
  const clearDone = useTodos((s) => s.clearDone)

  const [title, setTitle] = useState('')
  const [prio, setPrio] = useState<2 | 1 | 0>(1)
  const [due, setDue] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const today = todayKey()
  const weekEnd = new Date(Date.now() + 7 * 86400000)
  const weekEndKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`

  const list = useMemo(() => {
    let arr = [...todos]
    if (filter === 'today') arr = arr.filter((t) => !t.done && t.due && t.due <= today)
    else if (filter === 'week') arr = arr.filter((t) => !t.done && t.due && t.due <= weekEndKey)
    else if (filter === 'done') arr = arr.filter((t) => t.done)
    else arr = arr.filter((t) => !t.done)
    return arr.sort((a, b) => {
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due)
      if (a.due && !b.due) return -1
      if (!a.due && b.due) return 1
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.createdAt - a.createdAt
    })
  }, [todos, filter, today, weekEndKey])

  const doneCount = todos.filter((t) => t.done).length

  const submit = () => {
    if (!title.trim()) return
    add({ title, priority: prio, due: due || undefined })
    setTitle('')
    setDue('')
    setPrio(1)
  }

  const overdue = (t: Todo) => !t.done && t.due && t.due < today

  return (
    <div>
      <h1 className="page-title">待办事项</h1>
      <p className="page-sub">作业、复习计划、琐事，都丢进来 · 未完成 {todos.length - doneCount} 件</p>

      <Card className="mt16">
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            className="input"
            style={{ flex: 2 }}
            placeholder="要做点什么？"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
          <select className="input" style={{ width: 100 }} value={prio} onChange={(e) => setPrio(+e.target.value as 2 | 1 | 0)}>
            <option value={2}>高优先</option>
            <option value={1}>中优先</option>
            <option value={0}>低优先</option>
          </select>
          <input className="input" style={{ width: 150 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button icon="plus" onClick={submit}>添加</Button>
        </form>

        <div className="row mt12" style={{ gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['all', '未完成'],
              ['today', '今天到期'],
              ['week', '本周到期'],
              ['done', `已完成 ${doneCount}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
          {doneCount > 0 && (
            <Button size="sm" variant="ghost" icon="trash" onClick={clearDone} className="ml-auto">
              清理已完成
            </Button>
          )}
        </div>
      </Card>

      <div className="mt16">
        {list.length === 0 ? (
          <Empty icon="check" text={filter === 'done' ? '还没有已完成的记录' : '这里空空如也，先添加一条待办吧'} />
        ) : (
          <Card className="todo-list">
            {list.map((t) => (
              <div key={t.id} className="todo-item">
                <span className={`cb ${t.done ? 'checked' : ''}`} onClick={() => toggle(t.id)} />
                {editingId === t.id ? (
                  <input
                    className="input"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => {
                      if (editText.trim()) update(t.id, { title: editText.trim() })
                      setEditingId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <>
                    <span className={`todo-title ${t.done ? 'strike' : ''}`} onDoubleClick={() => { setEditingId(t.id); setEditText(t.title) }}>
                      {t.title}
                    </span>
                    <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                      <Tag color={PRIO[t.priority].color}>{PRIO[t.priority].label}</Tag>
                      {t.subject && <Tag color="indigo">{t.subject}</Tag>}
                      {t.due && <Tag color={overdue(t) ? 'red' : 'gray'}>{overdue(t) ? '已逾期 ' : ''}{t.due}</Tag>}
                      {t.done && <Tag color="green">完成</Tag>}
                    </span>
                    <span className="row todo-ops" style={{ gap: 2 }}>
                      <button className="icon-btn" title="编辑" onClick={() => { setEditingId(t.id); setEditText(t.title) }}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button className="icon-btn" title="删除" onClick={() => remove(t.id)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </span>
                  </>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
