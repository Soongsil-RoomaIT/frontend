interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function Switch({ checked, label, disabled = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'border border-border bg-bg'
      }`}
    >
      <span
        className={`absolute top-1/2 left-1 size-5 -translate-y-1/2 rounded-full shadow transition-transform ${
          checked ? 'translate-x-5 bg-white dark:bg-bg' : 'bg-muted'
        }`}
      />
    </button>
  )
}
