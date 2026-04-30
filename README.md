# Daily AI News

AI 관련 새 게시물을 자동으로 모니터링하고 Discord Webhook으로 알림을 보내는 무료 모니터링 시스템입니다. Instagram, Threads, RSS 피드를 주기적으로 확인하며, GitHub Actions cron을 활용해 별도 서버 없이 운영할 수 있도록 구성되어 있습니다.

## Features

- **소셜 계정 모니터링**: Instagram, Threads 계정의 최신 게시물을 확인하고 신규 게시물만 Discord embed로 알림을 전송합니다.
- **RSS 피드 수집**: Yozm IT AI RSS 피드를 파싱해 새 글을 Discord로 전달합니다.
- **AI Times 일일 다이제스트**: KST 기준 전날 등록된 AI타임스 기사를 모아 Discord 링크 목록으로 발송합니다.
- **중복 알림 방지**: `seen.json`에 이미 처리한 게시물 ID를 저장해 동일 콘텐츠가 반복 전송되지 않도록 관리합니다.
- **Seed 모드 지원**: 현재 최신 게시물을 상태 파일에만 저장하고 Discord 알림은 보내지 않아 초기 세팅 시 불필요한 알림을 방지합니다.
- **GitHub Actions 자동 실행**: 매일 정해진 시간대에 자동으로 모니터링과 다이제스트 작업을 실행합니다.
- **Discord 안전 전송**: Discord mention 파싱을 비활성화해 원치 않는 멘션 확산을 방지합니다.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: JavaScript ES Modules
- **Automation**: GitHub Actions
- **Browser Automation**: Playwright Chromium
- **Feed Parsing**: fast-xml-parser
- **Notification**: Discord Webhook
- **State Storage**: JSON file (`seen.json`)

## Setup & Usage

### 1. Install dependencies

```bash
npm ci
```

Threads 모니터링은 Playwright Chromium을 사용하므로 브라우저 런타임을 설치합니다.

```bash
npx playwright install chromium
```

GitHub Actions 환경에서는 OS 의존성까지 함께 설치합니다.

```bash
npx playwright install --with-deps chromium
```

### 2. Configure Discord webhooks

로컬 실행 시에는 필요한 Discord Webhook URL을 환경 변수로 설정합니다.

```bash
export DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_INSTAGRAM_PROMPPY="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_INSTAGRAM_AI_AINOW="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_THREADS_CHOI_OPENAI="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_YOZM_AI="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_AITIMES_DIGEST="https://discord.com/api/webhooks/..."
```

GitHub Actions에서 운영하려면 저장소의 **Settings > Secrets and variables > Actions**에 아래 Secrets를 등록합니다.

| Secret | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS` | Instagram `ai_freaks.kr` 알림 |
| `DISCORD_WEBHOOK_INSTAGRAM_PROMPPY` | Instagram `promppy_com` 알림 |
| `DISCORD_WEBHOOK_INSTAGRAM_AI_AINOW` | Instagram `ai.ainow` 알림 |
| `DISCORD_WEBHOOK_THREADS_CHOI_OPENAI` | Threads `choi.openai` 알림 |
| `DISCORD_WEBHOOK_YOZM_AI` | Yozm IT AI RSS 알림 |
| `DISCORD_WEBHOOK_AITIMES_DIGEST` | AI Times 일일 다이제스트 알림 |

### 3. Initialize seen state

처음 실행할 때는 현재 최신 게시물을 기준 상태로 저장하는 것을 권장합니다. 이 명령은 Discord 메시지를 보내지 않습니다.

```bash
npm run seed
```

### 4. Run social monitor

신규 게시물만 확인해 Discord로 전송합니다.

```bash
npm run check
```

`npm start`도 동일하게 `check` 모드로 실행됩니다.

```bash
npm start
```

### 5. Run AI Times digest

KST 기준 전날 AI타임스 기사 목록을 Discord로 전송합니다.

```bash
npm run aitimes:digest
```

특정 날짜를 대상으로 실행하려면 `TARGET_DATE`를 `YYYY-MM-DD` 형식으로 지정합니다.

```bash
TARGET_DATE=2026-04-29 npm run aitimes:digest
```

Discord 전송 없이 결과만 확인하려면 `DRY_RUN=1`을 사용합니다.

```bash
DRY_RUN=1 TARGET_DATE=2026-04-29 npm run aitimes:digest
```

## GitHub Actions Schedule

### Social Monitor

`.github/workflows/social-monitor.yml`에서 실행됩니다.

- KST 08:00부터 21:00까지 매시 정각 실행
- UTC cron: `0 23 * * *`, `0 0-12 * * *`
- 수동 실행 시 `check` 또는 `seed` 모드 선택 가능
- 실행 후 `seen.json`이 변경되면 GitHub Actions bot이 변경 사항을 커밋합니다.

### AI Times Digest

`.github/workflows/aitimes-digest.yml`에서 실행됩니다.

- 매일 KST 08:10 실행
- UTC cron: `10 23 * * *`
- 수동 실행 시 `target_date` 입력으로 특정 KST 날짜의 기사 목록 전송 가능

## Project Structure

```text
.
├── .github/workflows/
│   ├── aitimes-digest.yml
│   └── social-monitor.yml
├── aitimes-digest.js
├── monitor.js
├── seen.json
├── package-lock.json
├── package.json
└── README.md
```

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | 소셜 모니터를 `check` 모드로 실행합니다. |
| `npm run check` | 새 게시물을 확인하고 Discord 알림을 전송합니다. |
| `npm run seed` | 현재 최신 게시물을 `seen.json`에 저장하고 알림은 보내지 않습니다. |
| `npm run aitimes:digest` | AI타임스 전날 기사 다이제스트를 Discord로 전송합니다. |

## Notes

- `seen.json`은 중복 알림 방지를 위한 상태 파일입니다. 운영 중에는 GitHub Actions가 자동으로 갱신합니다.
- Discord Webhook 환경 변수가 누락된 계정은 신규 게시물을 `seen.json`에 반영하지 않으므로, Webhook 설정 후 다시 실행하면 알림을 보낼 수 있습니다.
- Instagram과 Threads 페이지 구조가 변경되면 수집 로직도 함께 조정해야 할 수 있습니다.
