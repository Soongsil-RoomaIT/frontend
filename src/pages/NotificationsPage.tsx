import { Bell, BrainCircuit, CircleCheck, Lightbulb, RefreshCw, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import type { AppNotification } from '@/api/types'
import { PageHeader } from '@/components/PageHeader'
import { useMarkRead, useNotifications } from '@/features/notifications/queries'
import { isUnread, notificationKind, type NotificationKind } from '@/features/notifications/unread'
import { formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import { markNotificationsSeen, useNotificationsSeenStore } from '@/stores/notificationsSeen'

const kindIcon: Record<NotificationKind, LucideIcon> = {
  device: SlidersHorizontal,
  recovery: CircleCheck,
  prediction: BrainCircuit,
  recommendation: Lightbulb,
  other: Bell,
}

const dayLabel = (ms: number, now: number) => {
  const d = new Date(ms)
  const today = new Date(now)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return '오늘'
  const yesterday = new Date(now - 86_400_000)
  if (sameDay(d, yesterday)) return '어제'
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function Item({ n, unread, now }: { n: AppNotification; unread: boolean; now: number }) {
  const Icon = kindIcon[notificationKind(n)]
  const createdMs = n.createdAt ? Date.parse(n.createdAt) : null
  return (
    <li className="flex items-start gap-3 px-4 py-3" aria-label={unread ? '읽지 않음' : undefined}>
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${unread ? 'bg-primary-soft text-primary' : 'bg-bg text-muted'}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {n.title && <p className={`text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{n.title}</p>}
        <p className={`text-sm ${n.title ? 'text-muted' : unread ? 'font-semibold' : ''}`}>{n.body}</p>
        {createdMs !== null && (
          <time dateTime={n.createdAt ?? undefined} className="text-xs text-muted" title={new Date(createdMs).toLocaleString('ko-KR')}>
            {formatRelative(createdMs, now)}
          </time>
        )}
      </div>
      {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
    </li>
  )
}

/** What the system did and why (FR-05). Everything here is also pushed as a toast when it happens. */
export function NotificationsPage() {
  const { data, isPending, isError, refetch, isFetching } = useNotifications()
  const now = useNow()
  // Read state is judged at the moment the page opened, so items don't lose their marker mid-read
  const seenAtMs = useNotificationsSeenStore((s) => s.seenAtMs)
  const markRead = useMarkRead()
  const unreadServerIds = (data ?? []).filter((n) => n.read === false).map((n) => n.id)
  const unreadKey = unreadServerIds.join(',')
  const newestMs = data?.[0]?.createdAt ? Date.parse(data[0].createdAt) : null

  // Seeing the list is reading it: locally always, and on the server when it tracks read state
  useEffect(() => {
    if (!data) return
    const latest = Math.max(Date.now(), newestMs ?? 0)
    const timer = setTimeout(() => {
      markNotificationsSeen(latest)
      if (unreadServerIds.length > 0) markRead.mutate(unreadServerIds)
    }, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per set of unread ids, not per render
  }, [unreadKey, newestMs, data !== undefined])

  const groups: { day: string; items: AppNotification[] }[] = []
  for (const n of data ?? []) {
    const day = n.createdAt ? dayLabel(Date.parse(n.createdAt), now) : '날짜 없음'
    const last = groups.at(-1)
    if (last?.day === day) last.items.push(n)
    else groups.push({ day, items: [n] })
  }

  return (
    <>
      <PageHeader title="알림" description="자동 제어 실행과 기기 상태 변화를 기록합니다." />
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : isError && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <span>알림을 불러오지 못했습니다.</span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-bg disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            다시 시도
          </button>
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">아직 알림이 없습니다.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-2 text-xs font-semibold text-muted">{g.day}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {g.items.map((n) => (
                  <Item key={n.id} n={n} unread={isUnread(n, seenAtMs)} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
