import React from 'react'
import {
  TEMPLATE_SORT_OPTIONS,
  type TemplateSortKey
} from '../utils/templateSort'

interface SortOption {
  value: string
  label: string
}

interface TemplateSortSelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  showLabel?: boolean
  options?: SortOption[]
  ariaLabel?: string
}

export function TemplateSortSelect({
  value,
  onChange,
  className = '',
  id,
  showLabel = false,
  options = TEMPLATE_SORT_OPTIONS,
  ariaLabel = 'Sort'
}: TemplateSortSelectProps): JSX.Element {
  const selectClassName =
    className ||
    'min-w-[11rem] rounded-md border border-border bg-surface2 px-2 py-1.5 text-[10px] text-text outline-none focus:border-accent'

  const select = (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={selectClassName}
      title={options.find((opt) => opt.value === value)?.label ?? ariaLabel}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )

  if (!showLabel) return select

  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="shrink-0 text-[10px] font-medium text-muted">
        Sort by
      </label>
      {select}
    </div>
  )
}
