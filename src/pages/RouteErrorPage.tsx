import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : '알 수 없는 오류'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-bold">문제가 발생했습니다</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <Link to="/" className="mt-4 text-sm font-semibold text-primary">
        대시보드로 돌아가기
      </Link>
    </div>
  )
}
