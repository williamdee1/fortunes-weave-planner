import { useState } from 'react'

export function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={text}
    >
      <span className="tooltip-icon" aria-hidden>i</span>
      {open && <span className="tooltip-bubble">{text}</span>}
    </span>
  )
}

export function TierBadge({ tier }: { tier: string }) {
  return <span className={`badge badge-tier-${tier}`}>{tier}</span>
}

export function WarnBadge({ title }: { title: string }) {
  return (
    <span className="badge badge-warn" title={title} style={{ cursor: 'help' }}>
      ⚠ unverified
    </span>
  )
}
