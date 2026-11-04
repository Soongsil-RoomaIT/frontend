import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** Native <dialog>: focus trap, Esc to cancel and backdrop come from the browser. */
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault() // keep `open` the single source of truth
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel() // backdrop click
      }}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-fg shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          {/* Cancel first and focused: the safe choice is the default */}
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white dark:text-bg"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
