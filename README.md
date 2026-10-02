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

### 목업 시나리오 패널 (개발 모드 전용)

목업 모드에서는 화면 오른쪽 아래 플라스크 버튼으로 다음 상황을 재현할 수 있습니다. 프로덕션 빌드에는 포함되지 않습니다.

- 기기 연결 끊기 / 복구: 라즈베리파이 단절 배너와 복구 리포트 (NFR-03)
- 서버 장애 8초: WebSocket 재연결(지수 백오프)과 재연결 후 데이터 재동기화
- 창문 / 현관문 열기·닫기: `device.state` 실시간 반영

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

## API 계약 (초안 — 백엔드와 협의 필요)

타입 정의는 [src/api/types.ts](src/api/types.ts), WebSocket 메시지는 [src/realtime/protocol.ts](src/realtime/protocol.ts)에 있습니다.

**REST**

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/api/sensors/latest` | `SensorReading` |
| GET | `/api/sensors/history?range=1h\|24h\|7d` | `SensorHistory` (1h: 1분, 24h: 5분, 7d: 1시간 평균) |
| GET | `/api/devices` | `Device[]` |
| GET | `/api/edge/status` | `EdgeStatus` |

**WebSocket** (`VITE_WS_URL`, JSON 텍스트 프레임 `{ "type": string, "payload": object }`)

| type | payload | 보내는 시점 |
|---|---|---|
| `sensor.update` | `SensorReading` | 엣지 측정마다 (5초 주기) |
| `device.state` | `Device` | 기기 상태 변경 시 |
| `edge.status` | `EdgeStatus` | 연결 직후 1회, 이후 엣지 연결 상태 변경 시 |
| `edge.recovered` | `EdgeRecoveryReport` | 엣지가 단절 후 재연결되었을 때 1회 |
| `heartbeat` | 없음 | **15초마다 (필수)** — 아래 참고 |

클라이언트는 알 수 없는 `type`이나 형식이 맞지 않는 메시지를 무시합니다. 연결이 끊기면 1초부터 최대 30초까지 지수 백오프로 재연결하고, 재연결되면 REST로 최신 상태를 다시 불러옵니다.

### ⚠️ 서버가 반드시 구현해야 할 것: heartbeat

Wi-Fi 끊김, NAT 타임아웃, 서버 프리즈처럼 **TCP 연결이 조용히 죽는 경우 브라우저는 `close` 이벤트를 받지 못합니다.** 소켓은 계속 "열림" 상태로 남고 데이터만 멈춥니다. 실측 결과 23분이 지나도 브라우저가 알아채지 못했습니다.

이를 막기 위해 서버는 **보낼 데이터가 없어도 15초마다 `{"type":"heartbeat"}`를 보내야 합니다.** (예: 엣지가 오프라인이라 `sensor.update`가 멈춘 동안에도)

클라이언트 동작:
1. 35초 동안 아무 프레임도 못 받으면 `{"type":"ping"}`을 보냄
2. 서버는 이에 **`{"type":"heartbeat"}`로 응답**해야 함
3. 5초 안에 응답이 없으면 소켓을 죽은 것으로 보고 재연결

Node.js `ws` 기준 구현 예시:

```js
setInterval(() => broadcast({ type: 'heartbeat' }), 15000)

socket.on('message', (raw) => {
  if (JSON.parse(String(raw)).type === 'ping') {
    socket.send(JSON.stringify({ type: 'heartbeat' }))
  }
})
```

### ⚠️ Socket.IO가 아니라 `ws`를 쓰세요

클라이언트는 브라우저 표준 `WebSocket` API를 사용합니다. **Socket.IO 서버와는 통신할 수 없습니다** (자체 핸드셰이크와 프레임 형식을 쓰므로). Node.js라면 [`ws`](https://github.com/websockets/ws) 라이브러리를 사용해 주세요. `ws` 8.x로 연동 테스트를 완료했습니다.

Socket.IO를 꼭 써야 한다면 프론트엔드에 `socket.io-client` 의존성을 추가하고 `src/realtime/RealtimeClient.ts`를 교체해야 합니다.
