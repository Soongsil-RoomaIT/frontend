import { House } from 'lucide-react'
import { Link } from 'react-router'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">
        <House className="mx-auto size-10 text-primary" aria-hidden />
        <h1 className="mt-4 text-xl font-bold">자취방 원격 케어</h1>
        <p className="mt-2 text-sm text-muted">OAuth 로그인은 5단계에서 연동됩니다.</p>
        <Link
          to="/"
          className="mt-6 block rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white dark:text-bg"
        >
          대시보드로 이동
        </Link>
      </div>
    </div>
  )
}
