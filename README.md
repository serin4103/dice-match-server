# Dice Match Socket Server

멀티플레이어 주사위 게임을 위한 Socket.IO 서버입니다.

## 설치

```bash
cd server
npm install
```

## 개발 서버 실행

```bash
npm run dev
```

서버는 기본적으로 `http://localhost:3001`에서 실행됩니다.

## 빌드

```bash
npm run build
```

## 프로덕션 실행

```bash
npm start
```

## 환경 변수

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```
PORT=3001
CLIENT_URL=http://localhost:3000
```

## API 엔드포인트

- `GET /` - 서버 상태 확인

## Socket.IO 이벤트

### 클라이언트 → 서버
- `join` - 게임 참가
- `startGame` - 게임 시작 요청
- `rollDice` - 주사위 굴리기

### 서버 → 클라이언트
- `gameState` - 현재 게임 상태
- `gameStarted` - 게임 시작 알림
- `diceRolled` - 주사위 굴림 결과
- `error` - 에러 메시지

## 게임 규칙

1. 최소 2명의 플레이어가 필요합니다
2. 각 플레이어는 차례대로 주사위를 굴립니다
3. 주사위 값(1-6)만큼 점수를 획득합니다
4. 50점에 먼저 도달한 플레이어가 승리합니다 