import { House } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Toaster } from '@/components/Toaster'
import { ConnectionBanner } from '@/features/monitoring/ConnectionBanner'
import { env } from '@/lib/env'
import { EdgeStatusBadge } from './EdgeStatusBadge'
import { navItems } from './navItems'

// Condition kept inline so production builds drop the mock panel chunk entirely
const MockScenarioPanel =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true'
    ? lazy(() => import('@/mocks/MockScenarioPanel'))
    : null

const sideLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-bg hover:text-fg'
  }`

const tabLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
    isActive ? 'text-primary' : 'text-muted'
  }`

export function AppLayout() {
  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <House className="size-6 text-primary" aria-hidden />
          <span className="text-base font-bold">자취방 원격 케어</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="주 메뉴">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={sideLinkClass}>
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <House className="size-5 text-primary" aria-hidden />
            <span className="text-sm font-bold">자취방 원격 케어</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {env.enableMocks && (
              <span className="rounded-full border border-status-warning/50 bg-status-warning/15 px-2.5 py-1 text-xs font-medium text-fg">
                목업 모드
              </span>
            )}
            <EdgeStatusBadge />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-8">
          <ConnectionBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="주 메뉴"
      >
        {navItems
          .filter((item) => item.mobile)
          .map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={tabLinkClass}>
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
      </nav>

      <Toaster />

      {MockScenarioPanel && (
        <Suspense fallback={null}>
          <MockScenarioPanel />
        </Suspense>
      )}
    </div>
  )
}
