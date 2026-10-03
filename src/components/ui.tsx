import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Icon } from './Icon'
import { useUI } from '../store/ui'

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  title,
  type = 'button',
  block,
  className = '',
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'soft' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  block?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children != null && children !== '' && <span>{children}</span>}
    </button>
  )
}

export function Card({
  children,
  className = '',
  title,
  extra,
}: {
  children?: ReactNode
  className?: string
  title?: ReactNode
  extra?: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || extra) && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Tag({ children, color = 'indigo' }: { children: ReactNode; color?: 'indigo' | 'green' | 'red' | 'amber' | 'gray' }) {
  return <span className={`tag tag-${color}`}>{children}</span>
}

export function Empty({ icon = 'list', text, children }: { icon?: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <div className="empty-text">{text}</div>
      {children}
    </div>
  )
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" />
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon?: string
  label: string
  value: ReactNode
  sub?: ReactNode
  onClick?: () => void
}) {
  return (
    <div className={`card stat ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="stat-top">
        {icon && (
          <span className="stat-icon">
            <Icon name={icon} size={16} />
          </span>
        )}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function BarChart({ data, unit = '' }: { data: { label: string; value: number; tip?: string }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-col" title={d.tip ?? `${d.label}：${d.value}${unit}`}>
          <div className="bar-value">{d.value > 0 ? d.value : ''}</div>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <Icon name={t.type === 'ok' ? 'checkmark' : t.type === 'err' ? 'zap' : 'chat'} size={15} />
          {t.text}
        </div>
      ))}
    </div>
  )
}
