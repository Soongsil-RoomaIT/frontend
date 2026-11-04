# 백엔드 연동 가이드

자취방 원격 케어 시스템 — 프론트엔드(React)가 클라우드 서버에 기대하는 동작을 정리한 문서입니다.
**백엔드 작업 전에 "0. 반드시 지켜야 할 것"만이라도 읽어주세요.**

- 작성 기준: 프론트엔드 3단계(기기 제어) 완료 시점
- 관련 코드: [`src/api/types.ts`](../src/api/types.ts), [`src/realtime/protocol.ts`](../src/realtime/protocol.ts)
- 현재 프론트엔드는 MSW 목업으로 동작하며, 실제 서버가 생기면 `.env`만 바꿔 붙입니다.

---

## 0. 반드시 지켜야 할 것

아래 항목은 **지키지 않으면 화면이 눈에 띄게 오동작합니다.** 나머지는 협의 가능합니다.

| # | 내용 | 안 지키면 |
|---|---|---|
| 1 | WebSocket은 **`ws` 라이브러리** 사용 (Socket.IO ❌) | 연결 자체가 안 됨 |
| 2 | **15초마다 `heartbeat` 전송** + 클라이언트 `ping`에 응답 | 35초마다 불필요한 재연결 반복 |
| 3 | WebSocket **연결 직후 `edge.status` 1회 전송** | 기기 연결 상태가 "확인 중"에서 안 바뀜 |
| 4 | 엣지 재연결 시 **`edge.recovered` 전송** | NFR-03 복구 리포트가 표시되지 않음 |
| 5 | CORS에서 **`Idempotency-Key` 헤더와 `OPTIONS` 허용** (2-4 참고) | 조회는 되는데 **기기 제어만 전부 실패** |
| 6 | 명령의 **`Idempotency-Key` 중복 처리** ([7-1](#7-1-명령-보내기)) | 재전송 시 창문이 두 번 움직일 수 있음 |

---

## 1. WebSocket

### 1-1. `ws`를 쓰세요. Socket.IO는 동작하지 않습니다

프론트엔드는 **브라우저 표준 `WebSocket` API**를 사용합니다. Socket.IO는 자체 핸드셰이크(Engine.IO)와
자체 프레임 형식(`42["event",{...}]`)을 쓰기 때문에 표준 WebSocket으로는 통신할 수 없습니다.

실제로 Socket.IO 4.8 서버를 띄워 확인한 결과입니다.

```
/ws                                    -> ERROR socket hang up         (연결 거부)
/socket.io/?EIO=4&transport=websocket  -> 0{"sid":"a5Fl...","upgrades"  (JSON이 아닌 자체 핸드셰이크)
```

[`ws`](https://github.com/websockets/ws) 8.x로 프론트엔드 연동 검증을 마쳤습니다.

```bash
npm install ws
```

> Socket.IO가 꼭 필요한 사정이 있으면 알려주세요. 프론트엔드에 `socket.io-client`를 추가하고
> `src/realtime/RealtimeClient.ts`를 교체하면 되지만, 그만한 이유가 없다면 `ws`가 간단합니다.

### 1-2. 메시지 형식

**텍스트 프레임에 JSON 한 개**를 담아 보냅니다.

```json
{ "type": "sensor.update", "payload": { ... } }
```

- 바이너리 프레임은 무시됩니다.
- 모르는 `type`이나 형식이 맞지 않는 `payload`는 **조용히 버려집니다.** 새 메시지 타입을 추가해도
  구버전 클라이언트가 깨지지 않으니 자유롭게 확장하세요.

### 1-3. 서버가 보내야 할 메시지

| type | payload | 보내는 시점 |
|---|---|---|
| `edge.status` | `EdgeStatus` | **연결 직후 1회(필수)**, 이후 엣지 연결 상태가 바뀔 때마다 |
| `sensor.update` | `SensorReading` | 엣지에서 측정값을 받을 때마다 (약 5초 주기) |
| `device.state` | `Device` | 기기 상태가 바뀔 때마다 |
| `edge.recovered` | `EdgeRecoveryReport` | 엣지가 단절 후 재연결되었을 때 1회 |
| `command.ack` | `CommandAck` | 비동기(202) 명령의 결과가 나왔을 때 — [7. 기기 제어](#7-기기-제어-fr-03-fr-04) 참고 |
| `heartbeat` | 없음 | **15초마다(필수)** + 클라이언트 `ping`에 대한 응답 |

### 1-4. ⚠️ heartbeat — 가장 놓치기 쉬운 부분

Wi-Fi 끊김, NAT 타임아웃, 서버 프리즈처럼 **TCP 연결이 close 프레임 없이 죽는 경우**가 있습니다.
이때 브라우저는 `onclose`를 받지 못해서, 소켓을 계속 "열림"으로 믿고 데이터만 멈춥니다.

실제로 프론트엔드에서 이 버그를 겪었습니다. 중간에 프록시를 넣고 패킷 전달만 멈춰보니,
**23분이 지나도 화면은 "기기 연결됨"을 표시하면서 멈춘 값을 보여줬습니다.**

그래서 클라이언트는 이렇게 동작합니다.

1. **35초** 동안 아무 프레임도 받지 못하면 → `{"type":"ping"}` 전송
2. **5초** 안에 아무 응답도 없으면 → 소켓을 죽은 것으로 보고 재연결

여기서 중요한 점은, **엣지가 오프라인이면 `sensor.update`가 멈춘다**는 것입니다.
그 동안에도 "서버와의 연결은 살아있다"는 것을 증명할 수단이 필요합니다. 그게 `heartbeat`입니다.

```js
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ server, path: '/ws' })
const clients = new Set()

wss.on('connection', (socket) => {
  clients.add(socket)

  // (필수 3) 연결 직후 현재 엣지 상태를 1회 전송
  socket.send(JSON.stringify({ type: 'edge.status', payload: currentEdgeStatus() }))

  // (필수 2-b) 클라이언트의 ping에 응답
  socket.on('message', (raw) => {
    try {
      if (JSON.parse(String(raw)).type === 'ping') {
        socket.send(JSON.stringify({ type: 'heartbeat' }))
      }
    } catch {
      // 파싱 실패는 무시
    }
  })

  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => clients.delete(socket))
})

const broadcast = (msg) => {
  const text = JSON.stringify(msg)
  for (const s of clients) if (s.readyState === 1 /* OPEN */) s.send(text)
}

// (필수 2-a) 보낼 데이터가 없어도 15초마다 전송
setInterval(() => broadcast({ type: 'heartbeat' }), 15_000)
```

> **참고:** `ws`의 `socket.ping()`(프로토콜 레벨 ping)은 **이 문제를 해결하지 못합니다.**
> 브라우저가 pong을 자동으로 보내주긴 하지만, 브라우저의 JavaScript에서는 그걸 볼 수 없습니다.
> 그래서 위처럼 **애플리케이션 레벨 메시지**로 주고받아야 합니다.
> (서버가 죽은 클라이언트를 정리하는 용도로는 `socket.ping()`도 유용하니 함께 쓰셔도 됩니다.)

### 1-5. 클라이언트가 알아서 처리하는 것들

서버에서 신경 쓰지 않아도 되는 부분입니다.

- **재연결**: 끊기면 1초 → 2초 → 4초 … 최대 30초까지 지수 백오프로 재시도합니다.
  지터(50~100%)가 들어가 있어서, 서버 재시작 시 모든 클라이언트가 동시에 몰리지 않습니다.
- **재연결 후 재동기화**: 재연결되면 `/api/sensors/latest`, `/api/devices`, `/api/edge/status`를
  다시 호출해 끊긴 동안 놓친 상태를 맞춥니다. **서버가 과거 메시지를 다시 보내줄 필요는 없습니다.**
- **순서 뒤바뀜**: `sensor.update`의 `measuredAt`이 현재 값보다 과거면 버립니다.
  `device.state`도 `updatedAt` 기준으로 같게 처리합니다.
- **중복 전송**: 같은 값을 여러 번 보내도 안전합니다.

---

## 2. REST API

### 2-1. 엔드포인트

| 메서드 | 경로 | 응답 |
|---|---|---|
| GET | `/api/sensors/latest` | `SensorReading` |
| GET | `/api/sensors/history?range=1h\|24h\|7d` | `SensorHistory` |
| GET | `/api/devices` | `Device[]` |
| GET | `/api/edge/status` | `EdgeStatus` |
| POST | `/api/devices/{id}/commands` | `CommandResponse` — [7. 기기 제어](#7-기기-제어-fr-03-fr-04) 참고 |

### 2-2. 응답 예시

**`GET /api/sensors/latest`**

```json
{
  "measuredAt": "2026-10-02T11:30:05.000Z",
  "temperature": 23.5,
  "humidity": 58,
  "co2": 912,
  "pm25": 18,
  "pm10": 34
}
```

- `measuredAt`은 **ISO 8601 + 타임존**으로 주세요. (`Z` 또는 `+09:00`)
  타임존이 없으면 브라우저가 로컬 시각으로 해석해서 9시간 어긋납니다.
- 숫자는 숫자로 보내주세요. `"912"` 같은 문자열은 형식 검사에서 버려집니다.

**`GET /api/sensors/history?range=24h`**

```json
{
  "range": "24h",
  "bucketSeconds": 300,
  "points": [
    { "measuredAt": "2026-10-01T11:30:00.000Z", "temperature": 22.8, "humidity": 61, "co2": 845, "pm25": 15, "pm10": 29 },
    { "measuredAt": "2026-10-01T11:35:00.000Z", "temperature": 22.9, "humidity": 61, "co2": 858, "pm25": 16, "pm10": 30 }
  ]
}
```

- **서버에서 집계해서 주세요.** 원본 측정값(5초 주기)을 그대로 주면 7일치가 12만 개가 됩니다.
- 각 점은 **버킷 평균**, `measuredAt`은 **버킷 시작 시각**으로 가정하고 있습니다.
- 기대하는 집계 단위:

  | range | bucketSeconds | 점 개수 |
  |---|---|---|
  | `1h` | 60 (1분) | 60개 |
  | `24h` | 300 (5분) | 288개 |
  | `7d` | 3600 (1시간) | 168개 |

- `bucketSeconds`를 응답에 담아주시면 화면에 "5분 평균"처럼 표시합니다. 위 값과 달라도 됩니다.
- 잘못된 `range`는 `400`으로 응답해주세요.
- 데이터가 없으면 `points: []`로 주세요. (빈 화면 안내가 뜹니다)

**`GET /api/devices`**

```json
[
  { "id": "window-1",       "type": "WINDOW",       "name": "창문",       "state": "CLOSED", "updatedAt": "2026-10-02T11:28:00.000Z" },
  { "id": "dehumidifier-1", "type": "DEHUMIDIFIER", "name": "제습기",     "state": "OFF",    "updatedAt": "2026-10-02T09:12:00.000Z" },
  { "id": "purifier-1",     "type": "AIR_PURIFIER", "name": "공기청정기", "state": "ON",     "updatedAt": "2026-10-02T08:40:00.000Z" },
  { "id": "door-1",         "type": "FRONT_DOOR",   "name": "현관문",     "state": "CLOSED", "updatedAt": "2026-10-02T11:05:00.000Z" }
]
```

- `name`은 화면에 그대로 표시됩니다. 사용자가 바꿀 수 있게 할 거면 알려주세요.
- `type`은 화면에서 아이콘을 고르는 데 씁니다. **기기 종류가 더 늘거나 줄면 꼭 알려주세요.**

**`GET /api/edge/status`**

```json
{
  "online": true,
  "offlineMode": false,
  "lastSeenAt": "2026-10-02T11:30:05.000Z"
}
```

| 필드 | 의미 |
|---|---|
| `online` | **클라우드가** 라즈베리파이의 신호를 받고 있는지 |
| `offlineMode` | **라즈베리파이가** 클라우드 판단 대신 자체 규칙으로 제어 중인지 (NFR-03) |
| `lastSeenAt` | 클라우드가 엣지로부터 마지막으로 뭔가 받은 시각 |

`online: false`와 `offlineMode: true`는 **다른 상태**이고 화면 표시도 다릅니다.
`online: false`는 "연결이 끊겼다", `offlineMode: true`는 "연결은 됐는데 자체 판단으로 돌고 있다"입니다.

**`edge.recovered` payload** (WebSocket 전용)

```json
{
  "offlineSince": "2026-10-02T10:15:00.000Z",
  "recoveredAt":  "2026-10-02T10:23:40.000Z",
  "localActions": [
    { "executedAt": "2026-10-02T10:18:00.000Z", "deviceId": "dehumidifier-1", "state": "ON",   "reason": "습도 72%" },
    { "executedAt": "2026-10-02T10:20:00.000Z", "deviceId": "window-1",       "state": "OPEN", "reason": "CO₂ 1340ppm" }
  ]
}
```

- `reason`은 **화면에 그대로 표시되는 사람이 읽는 문구**입니다. 코드값이 아니라 `"습도 72%"`처럼 주세요.
- `localActions`는 비어 있어도 됩니다. ("실행된 로컬 자동제어는 없습니다"로 표시)
- `deviceId`는 `/api/devices`의 `id`와 일치해야 기기 이름으로 바꿔 표시할 수 있습니다.

### 2-3. 에러 응답

실패는 **HTTP 상태 코드**로 알려주세요. 본문 형식은 자유입니다.

```json
{ "message": "Service unavailable" }
```

클라이언트 재시도 정책입니다.

- **4xx**: 재시도하지 않습니다. (다시 보내도 실패할 요청으로 간주)
- **5xx / 네트워크 오류**: 최대 2회 자동 재시도합니다.
- 최종 실패 시 화면에 "다시 시도" 버튼이 나옵니다.

### 2-4. ⚠️ CORS (개발 환경)

개발 중에는 프론트엔드가 `http://localhost:5173`, 백엔드가 `http://localhost:8080`처럼
**다른 포트**에서 돌아갑니다. CORS 헤더가 없으면 브라우저가 모든 요청을 막습니다.

**GET만 되고 기기 제어(POST)가 안 된다면 거의 확실히 이 문제입니다.** 명령 요청은 `Content-Type: application/json`과
`Idempotency-Key` 헤더를 보내기 때문에, 브라우저가 먼저 **`OPTIONS` 사전 요청(preflight)** 을 보냅니다.
여기에 아래 헤더로 응답하지 않으면 실제 POST는 아예 전송되지 않습니다.

```
Access-Control-Allow-Origin:  http://localhost:5173
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Idempotency-Key, Authorization
```

실제 Node 서버로 확인한 결과입니다.

| 서버 설정 | 결과 |
|---|---|
| `Access-Control-Allow-Origin`만 설정 (흔한 첫 시도) | ❌ 조회는 되지만 **모든 기기 명령이 CORS로 차단** |
| 위 3개 헤더 + `OPTIONS` 응답 | ✅ 정상 (명령 결과까지 1.5초) |

```js
// Express: cors 패키지는 OPTIONS와 요청 헤더 허용을 자동으로 처리합니다
import cors from 'cors'
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization'],
}))
```

> **프론트엔드 목업(MSW)에서는 이 문제가 재현되지 않습니다.** 요청이 브라우저 안에서 가로채져서 preflight가
> 일어나지 않기 때문입니다. 실제 서버를 처음 붙일 때 꼭 기기 제어까지 눌러보세요.

운영 환경에서 프론트엔드와 같은 도메인으로 배포한다면 필요 없습니다.

> WebSocket에는 CORS가 적용되지 않습니다. 다만 `ws`에서 `verifyClient`로 Origin을 검사한다면
> 개발용 주소를 허용 목록에 넣어주세요.

### 2-5. 인증

현재는 미구현이고 **5단계에서 OAuth/JWT를 붙일 예정**입니다. 프론트엔드에는 토큰이 설정되면
모든 REST 요청에 자동으로 헤더를 붙이는 코드만 준비돼 있습니다.

```
Authorization: Bearer <JWT>
```

**WebSocket 인증 방식은 아직 정하지 않았습니다.** 브라우저 WebSocket API는 헤더를 직접 넣을 수 없어서
보통 둘 중 하나를 씁니다. 백엔드에서 편한 쪽으로 정해주시면 맞추겠습니다.

1. 접속 URL 쿼리에 토큰: `wss://.../ws?token=<JWT>` (로그에 토큰이 남을 수 있음)
2. 연결 후 첫 메시지로 토큰 전송: `{"type":"auth","payload":{"token":"..."}}`

---

## 3. 타이밍 정리

프론트엔드가 쓰는 값입니다. 서버 설정과 맞춰주세요.

| 항목 | 값 | 비고 |
|---|---|---|
| 서버 heartbeat 주기 | **15초** | 서버가 지켜야 함 |
| 클라이언트 ping 발동 | 35초 무응답 시 | heartbeat 2회 + 여유 5초 |
| ping 응답 대기 | 5초 | 초과 시 재연결 |
| 재연결 백오프 | 1초 → 최대 30초 | 지터 50~100% |
| 센서값 "지연" 표시 | 15초 | 측정 주기 5초 × 3회 |
| 기록 자동 갱신 | 1h: 1분 / 24h: 5분 / 7d: 30분 | REST 재호출 주기 |
| 명령 결과 대기 | 20초 | 초과 시 REST로 실제 상태 확인 후 판정 |
| 명령 "응답 대기 중" 표시 | 5초 | NFR-02 기준 |
| 현관문 자동 닫기 (기본값) | 10분 | 서버가 `autoCloseAt`을 주면 그 값 사용 |

---

## 4. 타입 정의 (복사용)

원본: [`src/api/types.ts`](../src/api/types.ts)

```ts
interface SensorReading {
  measuredAt: string   // ISO 8601 (타임존 포함)
  temperature: number  // °C
  humidity: number     // %RH
  co2: number          // ppm
  pm25: number         // µg/m³
  pm10: number         // µg/m³
}

interface SensorHistory {
  range: '1h' | '24h' | '7d'
  bucketSeconds: number
  points: SensorReading[]
}

type DeviceType = 'WINDOW' | 'DEHUMIDIFIER' | 'AIR_PURIFIER' | 'FRONT_DOOR'
type DeviceState = 'OPEN' | 'CLOSED' | 'ON' | 'OFF'   // 창문·현관문: OPEN/CLOSED, 가전: ON/OFF

interface Device {
  id: string
  type: DeviceType        // 모르는 종류도 허용 (일반 기기로 표시)
  name: string
  state: DeviceState
  updatedAt: string       // 상태가 마지막으로 바뀐 시각
  actions?: DeviceAction[]
  stateSource?: 'SENSOR' | 'ASSUMED'
  autoCloseAt?: string | null
}

interface EdgeStatus {
  online: boolean
  offlineMode: boolean
  lastSeenAt: string
}

interface LocalAction {
  executedAt: string
  deviceId: string
  state: DeviceState
  reason: string   // 사람이 읽는 문구
}

interface EdgeRecoveryReport {
  offlineSince: string
  recoveredAt: string
  localActions: LocalAction[]
}

// 3단계: 기기 제어
type DeviceAction = 'OPEN' | 'CLOSE' | 'ON' | 'OFF'

interface CommandResponse {          // POST /api/devices/{id}/commands
  commandId: string
  status: 'PENDING' | 'EXECUTED' | 'FAILED'
  reason?: string                    // 사람이 읽는 문구
  device?: Device
}

interface CommandAck {               // WebSocket command.ack
  commandId: string
  deviceId: string
  status: 'EXECUTED' | 'FAILED'
  reason?: string
  device?: Device
}
```

---

## 5. 앞으로 필요한 API (초안 — 협의 필요)

4~5단계에서 쓸 예정입니다. **아직 확정이 아니니 설계 단계에서 의견 주세요.**

### 3단계: 기기 제어 (FR-03, FR-04)

✅ 구현 완료. [7. 기기 제어](#7-기기-제어-fr-03-fr-04)를 보세요.

### 4단계: 예보·추천 (FR-02)

```
GET  /api/forecast
POST /api/decisions/{id}/approve | /reject
```

```jsonc
{
  "weather": [ { "time": "...", "temp": 18.2, "humidity": 72, "precipitationProb": 80, "pm25": 42 } ],
  "decisions": [
    {
      "id": "...",
      "deviceId": "window-1",
      "action": "CLOSE",
      "reasons": [                              // 화면에 근거로 표시
        { "factor": "강수확률", "value": "80%", "threshold": "60% 이상" }
      ],
      "status": "PROPOSED"                      // PROPOSED | APPROVED | EXECUTED | REJECTED
    }
  ]
}
```

- **기상청 API는 서버에서 호출해주세요.** 프론트에서 직접 호출하면 API 키가 번들에 노출되고,
  공공데이터포털 API는 보통 CORS 헤더를 주지 않아 브라우저에서 막힙니다.
- **판단 로직도 서버에 있어야 합니다.** 사용자는 외출 중이고 브라우저는 꺼져 있습니다.
  프론트가 판단하면 웹사이트를 열어둔 동안에만 자동제어가 동작하게 됩니다.
- 판단 결과만이 아니라 **근거(`reasons`)도 함께** 주세요. "창문을 닫습니다"만으로는 사용자가 납득하지 못합니다.

> **문서 모순 하나:** 요구사항 FR-05는 "자동 제어가 **실행된 경우** 알림"인데,
> 유스케이스 3번은 "사용자가 **승인**한다 → 시스템이 동작시킨다"입니다.
> 설정에서 **완전 자동 / 승인 후 실행**을 고르게 하는 쪽을 제안합니다.
> (외출 중 승인을 못 하면 시스템이 멈추므로 완전 자동이 기본값)

### 5단계: 알림·인증 (FR-05, 보안)

```
POST /api/push/token          FCM 토큰 등록
GET  /api/notifications       알림 목록
GET/PUT /api/settings/automation
```

---

## 6. 프론트엔드와 붙여보기

```bash
# 1. 백엔드를 8080에서 실행 (CORS 허용 필요)

# 2. 프론트엔드 저장소에서
npm install
cp .env.example .env.development.local
```

`.env.development.local`을 이렇게 수정합니다. (이 파일은 git에 올라가지 않습니다)

```bash
VITE_ENABLE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

```bash
npm run dev    # http://localhost:5173
```

목업이 꺼지면 헤더의 "목업 모드" 배지가 사라집니다. 연결이 정상이면 우측 상단 배지가
**"기기 연결됨"** 으로 바뀝니다.

### 화면으로 확인하는 체크리스트

| 확인할 것 | 정상이면 |
|---|---|
| REST 연동 | 대시보드 카드 5개에 값이 표시됨 |
| `edge.status` 전송 | 배지가 "확인 중" → "기기 연결됨" |
| `sensor.update` 푸시 | "n초 전 측정"이 계속 갱신됨 |
| heartbeat | 센서 데이터를 멈춰도 배지가 "기기 연결됨" 유지 |
| heartbeat 누락 시 | 35~40초 후 "서버와 연결이 끊어졌습니다" 배너 (← 이러면 heartbeat 미구현) |
| 기록 API | `/history`에서 차트가 그려짐 |

---

## 7. 기기 제어 (FR-03, FR-04)

하드웨어 구성이 아직 확정되지 않았다는 전제로 만들었습니다. **서버가 기기마다 "무엇을 할 수 있는지"를 알려주면
프론트엔드는 그대로 따르고, 알려주지 않으면 기본값을 씁니다.** 하드웨어가 바뀌어도 서버 응답만 바꾸면 됩니다.

### 7-1. 명령 보내기

```
POST /api/devices/{id}/commands
Idempotency-Key: 3f2b9c1e-...          ← 버튼 한 번 누를 때마다 새로 생성
Content-Type: application/json

{ "action": "OPEN" }                    ← OPEN | CLOSE | ON | OFF
```

> ⚠️ **`Idempotency-Key`를 꼭 처리해 주세요.** 같은 키로 요청이 두 번 오면(네트워크 재시도 등)
> **두 번째는 실행하지 말고 첫 번째 응답을 그대로** 돌려주세요. 창문이 두 번 움직이면 안 됩니다.
> (프론트엔드는 명령 요청을 자동 재시도하지 않지만, 중간 프록시나 브라우저가 재전송할 수 있습니다)

### 7-2. 응답 — 비동기(권장)와 동기 둘 다 지원합니다

**비동기 (권장).** 창문 모터처럼 시간이 걸리는 기기에 맞습니다.

```
HTTP/1.1 202 Accepted
{ "commandId": "cmd-123", "status": "PENDING" }
```

결과가 나오면 WebSocket으로:

```json
{ "type": "command.ack", "payload": {
    "commandId": "cmd-123",
    "deviceId": "window-1",
    "status": "EXECUTED",
    "device": { "id": "window-1", "type": "WINDOW", "name": "창문", "state": "OPEN", "updatedAt": "..." }
} }
```

```json
{ "type": "command.ack", "payload": {
    "commandId": "cmd-123",
    "deviceId": "window-1",
    "status": "FAILED",
    "reason": "창문 모터 과부하가 감지되어 중지했습니다."
} }
```

- `reason`은 **화면에 그대로** 표시됩니다. 사람이 읽는 문구로 주세요.
- `device`는 선택이지만 주시면 화면이 즉시 갱신됩니다. 없으면 프론트가 `/api/devices`를 다시 불러옵니다.
- 상태가 바뀌었으면 평소처럼 `device.state`도 보내주세요.

**동기.** 바로 끝나는 기기라면 이렇게 줘도 됩니다.

```
HTTP/1.1 200 OK
{ "commandId": "cmd-124", "status": "EXECUTED", "device": { ... } }
```

### 7-3. 프론트엔드가 결과를 판단하는 방법

서버 구현이 조금 달라도 동작하도록, 아래 중 **먼저 오는 것**으로 결과를 정합니다.

| 신호 | 판정 |
|---|---|
| 응답의 `status`가 `EXECUTED` / `FAILED` | 그대로 |
| `command.ack` (같은 `commandId`) | 그대로 |
| `device.state`로 목표 상태가 됨 (`updatedAt`이 명령 시작 시점보다 새로움) | 성공 — **ack가 없는 서버도 동작합니다** |
| 20초 동안 아무것도 없음 | `/api/devices`로 확인 → 목표 상태면 성공, 아니면 "기기 응답이 없습니다" |

참고로 처리하는 경우들:

- `command.ack`가 HTTP 응답보다 **먼저** 와도 됩니다. (잠깐 보관했다가 맞춰봅니다)
- 응답 본문이 비어 있어도(`204`) 됩니다. 접수된 것으로 보고 위 신호를 기다립니다.
- 같은 기기에 명령이 진행 중이면 프론트가 버튼을 막습니다. 그래도 서버는 `409`를 줄 수 있습니다.

### 7-4. 에러 응답

본문에 `{ "message": "..." }`가 있으면 **그 문구를 그대로** 사용자에게 보여줍니다. 없으면 아래 기본 문구를 씁니다.

| 상태 | 기본 문구 | 언제 |
|---|---|---|
| 400 / 422 | 지원하지 않는 명령입니다. | 그 기기가 못 하는 `action` |
| 401 / 403 | 이 기기를 조작할 권한이 없습니다. | |
| 404 | 기기를 찾을 수 없습니다. | |
| 409 | 기기가 다른 명령을 처리하고 있습니다. | 이전 명령 진행 중 |
| 503 | 기기와 연결되어 있지 않습니다. | **라즈베리파이 오프라인** |
| 그 외 5xx | 서버 오류로 명령을 보내지 못했습니다. | |

에러 본문은 JSON이 아니어도 됩니다 (프록시 HTML 페이지 등). 상태 코드만으로 판단합니다.

### 7-5. `Device`에 추가된 선택 필드

전부 **선택**입니다. 안 보내면 괄호 안의 기본 동작을 합니다.

```ts
interface Device {
  // ...기존 필드
  actions?: ('OPEN' | 'CLOSE' | 'ON' | 'OFF')[]  // (기기 종류별 기본값)
  stateSource?: 'SENSOR' | 'ASSUMED'              // (SENSOR)
  autoCloseAt?: string | null                      // (현관문: updatedAt + 10분)
}
```

**`actions` — 이 기기로 할 수 있는 명령.** 하드웨어가 확정되면 이걸로 알려주세요.

| 기기 | 기본값 (안 보낼 때) | 예 |
|---|---|---|
| `WINDOW` | `OPEN`, `CLOSE` | |
| `DEHUMIDIFIER`, `AIR_PURIFIER` | `ON`, `OFF` | |
| `FRONT_DOOR` | **`CLOSE`만** | 원격 열기는 보안상 기본 비활성. 꼭 필요하면 `["OPEN","CLOSE"]` |
| 모르는 종류 | 없음 (조작 불가) | 새 기기는 `actions`를 보내면 바로 조작 가능 |

- `[]`를 보내면 **센서만 있는 기기**로 보고 버튼을 숨깁니다. (예: 현관문에 액추에이터가 없는 경우)
- 화면은 현재 상태를 바꾸는 명령만 버튼으로 보여줍니다. (닫힌 창문 → "열기"만)

**`stateSource` — 상태를 어떻게 알았는지.** IR 리모컨처럼 **기기에서 상태를 읽을 수 없는** 경우
`"ASSUMED"`를 보내주세요. 화면에 "상태 추정" 표시를 붙여서, 사용자가 실제와 다를 수 있음을 알게 합니다.

**`autoCloseAt` — 현관문 자동 닫기 시각 (FR-03).**

| 값 | 의미 |
|---|---|
| ISO 시각 | 그 시각까지 카운트다운 표시 (**권장** — 서버 설정과 화면이 항상 일치) |
| 생략 | `updatedAt + 10분`으로 추정해서 표시 |
| `null` | 자동 닫기 꺼짐 |

> ⚠️ **자동으로 닫는 동작은 반드시 서버나 엣지에서 하세요.** 프론트엔드는 카운트다운만 보여줍니다.
> 사용자는 외출 중이고 브라우저는 보통 꺼져 있습니다.

### 7-6. 하드웨어 팀과 확인이 필요한 것

| 질문 | 영향 |
|---|---|
| 현관문에 액추에이터(도어클로저)가 실제로 있나? | 없으면 `FRONT_DOOR`에 `actions: []` → FR-03은 표시만 |
| 제습기·공기청정기를 IR로 제어하나? | IR이면 `stateSource: "ASSUMED"` |
| 창문 모터가 한 번 동작하는 데 몇 초? | 20초를 넘으면 프론트 대기 시간 조정 필요, NFR-02(5초) 재검토 |
| 창문 중간 열림(0~100%) 지원? | 지원하면 상태 모델 확장 필요 (현재는 열림/닫힘만) |

---

## 문의

프론트엔드 쪽 질문이나 계약 변경 요청은 PR이나 이슈로 남겨주세요.
필드명·구조는 대부분 **협의해서 바꿀 수 있습니다.** 다만 "0. 반드시 지켜야 할 것"의 항목들은
프론트엔드 동작과 직결되니 바꾸기 전에 꼭 이야기해주세요.
