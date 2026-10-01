import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-bold text-muted">404</p>
      <p className="mt-2 text-sm text-muted">페이지를 찾을 수 없습니다.</p>
      <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary">
        대시보드로 돌아가기
      </Link>
    </div>
  )
}
