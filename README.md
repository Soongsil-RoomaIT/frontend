# 자취방 원격 케어 시스템 — Web

1인 가구를 위한 AIoT 원격 모니터링·제어 웹 애플리케이션 (룸메 IT).

## 기술 스택

React 19 · TypeScript · Vite · React Router · TanStack Query · Zustand · Tailwind CSS v4 · MSW · oxlint

## 시작하기

```bash
npm install
npm run dev        # http://localhost:5173
```

개발 모드에서는 `.env.development`의 `VITE_ENABLE_MOCKS=true` 설정으로 MSW 목업 API가 동작합니다.
실제 백엔드에 붙이려면 `.env.development.local`을 만들어 아래 값을 덮어쓰세요 (git에 올라가지 않음).

```bash
VITE_ENABLE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (목업 코드는 번들에서 제외됨) |
| `npm run typecheck` | 타입 검사만 |
| `npm run lint` | oxlint |
| `npm run preview` | 빌드 결과 미리보기 |

## 폴더 구조

```
src/
  api/          REST 클라이언트, 엔드포인트, API 계약 타입
  app/          라우터, 전역 Provider, QueryClient
  components/   공통 컴포넌트, 레이아웃(사이드바/하단 탭)
  lib/          환경변수 등 유틸
  mocks/        MSW 핸들러와 가짜 데이터
  pages/        라우트 단위 페이지
```

import 경로는 `@/` 별칭으로 `src/`를 가리킵니다.
