import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { dismissToast, useToastStore, type Toast } from '@/stores/toasts'

const toneIcon: Record<Toast['tone'], { icon: typeof Info; className: string }> = {
  success: { icon: CircleCheck, className: 'text-status-good' },
  error: { icon: TriangleAlert, className: 'text-status-critical' },
  info: { icon: Info, className: 'text-series-1' },
}

/** Global result messages, so a command that finishes after the user left the page still reports. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-16 z-30 flex flex-col items-stretch gap-2 md:inset-x-auto md:right-6 md:w-80"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = toneIcon[t.tone]
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-xs text-muted">{t.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="-m-1 shrink-0 rounded p-1 text-muted hover:text-fg"
              aria-label="닫기"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
