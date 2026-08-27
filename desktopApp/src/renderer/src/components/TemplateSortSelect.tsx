import React from 'react'
import {
  TEMPLATE_SORT_OPTIONS,
  type TemplateSortKey
} from '../utils/templateSort'

interface TemplateSortSelectProps {
  value: TemplateSortKey
  onChange: (value: TemplateSortKey) => void
  className?: string
  id?: string
}

export function TemplateSortSelect({
  value,
  onChange,
  className = '',
  id
}: TemplateSortSelectProps): JSX.Element {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as TemplateSortKey)}
      aria-label="Sort templates"
      className={
        className ||
        'rounded-md border border-border bg-surface2 px-2 py-1 text-[10px] text-text outline-none focus:border-accent'
      }
    >
      {TEMPLATE_SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
