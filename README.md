# Daily AI News

AI 관련 새 게시물을 자동으로 모니터링하고 Discord Webhook으로 알림을 보내는 무료 모니터링 시스템입니다. Instagram, Threads, RSS/API 소스를 주기적으로 확인하며, GitHub Actions cron을 활용해 별도 서버 없이 운영할 수 있도록 구성되어 있습니다.

## Features

- **소셜 계정 모니터링**: Instagram, Threads 계정의 최신 게시물을 확인하고 신규 게시물만 Discord 포럼 게시물로 전송합니다.
- **Yozm IT 수집**: Yozm IT AI API를 조회해 새 글을 Discord 포럼 게시물로 전달합니다.
- **GeekNews 링크 수집**: GeekNews 새 소식 1-2페이지에서 외부 원문 링크가 있는 글만 Discord 포럼 게시물로 전달합니다.
- **AI Times 일일 다이제스트**: KST 기준 전날 등록된 AI타임스 기사를 모아 Discord 포럼 게시물로 발송합니다.
- **포럼 태그 자동 적용**: AI타임스는 `AI 뉴스` 태그를 고정 적용하고, 소셜/요즘IT/GeekNews는 Claude Haiku 4.5로 태그 1개를 예측합니다.
- **키워드 fallback**: Anthropic API 키가 없거나 LLM 호출이 실패하면 로컬 키워드 룰로 태그를 분류합니다.
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
- **LLM Classification**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
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
export DISCORD_WEBHOOK_HADA_LINKS="https://discord.com/api/webhooks/..."
export DISCORD_WEBHOOK_AITIMES_DIGEST="https://discord.com/api/webhooks/..."
export ANTHROPIC_API_KEY="..."
export ANTHROPIC_TAG_MODEL="claude-haiku-4-5-20251001"
export DISCORD_TAG_AI_NEWS="..."
export DISCORD_TAG_AI_CODING="..."
export DISCORD_TAG_PROMPT_TIPS="..."
export DISCORD_TAG_AGENT_AUTOMATION="..."
export DISCORD_TAG_MODEL_SERVICE="..."
export DISCORD_TAG_BUSINESS_INVESTMENT="..."
export DISCORD_TAG_INFRA_SEMICONDUCTOR="..."
export DISCORD_TAG_POLICY_REGULATION="..."
export DISCORD_TAG_SECURITY_SAFETY="..."
export DISCORD_TAG_USE_CASE="..."
export DISCORD_TAG_OTHER="..."
```

GitHub Actions에서 운영하려면 저장소의 **Settings > Secrets and variables > Actions**에 아래 값을 등록합니다. 토큰과 Webhook, 태그 ID는 Secrets에 넣고, `ANTHROPIC_TAG_MODEL`은 Variables에 넣어도 됩니다.

포럼 게시물로 올리려면 각 Webhook은 Discord 포럼 채널에 연결되어 있어야 하며, 태그 Secret 값은 태그 이름이 아니라 Discord의 포럼 태그 ID입니다.

| Name | Purpose |
| --- | --- |
| `DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS` | Instagram `ai_freaks.kr` 알림 |
| `DISCORD_WEBHOOK_INSTAGRAM_PROMPPY` | Instagram `promppy_com` 알림 |
| `DISCORD_WEBHOOK_INSTAGRAM_AI_AINOW` | Instagram `ai.ainow` 알림 |
| `DISCORD_WEBHOOK_THREADS_CHOI_OPENAI` | Threads `choi.openai` 알림 |
| `DISCORD_WEBHOOK_YOZM_AI` | Yozm IT AI 알림 |
| `DISCORD_WEBHOOK_HADA_LINKS` | GeekNews 외부 링크형 글 알림 |
| `DISCORD_WEBHOOK_AITIMES_DIGEST` | AI Times 일일 다이제스트 알림 |
| `ANTHROPIC_API_KEY` | 소셜/요즘IT 태그 예측용 Anthropic API 키 |
| `ANTHROPIC_TAG_MODEL` | 선택 사항. 태그 예측 모델. 기본값은 `claude-haiku-4-5-20251001` |
| `DISCORD_TAG_AI_NEWS` | AI타임스 전용 `AI 뉴스` 포럼 태그 ID |
| `DISCORD_TAG_AI_CODING` | `AI코딩` 포럼 태그 ID |
| `DISCORD_TAG_PROMPT_TIPS` | `프롬프트·활용팁` 포럼 태그 ID |
| `DISCORD_TAG_AGENT_AUTOMATION` | `에이전트·자동화` 포럼 태그 ID |
| `DISCORD_TAG_MODEL_SERVICE` | `모델·서비스` 포럼 태그 ID |
| `DISCORD_TAG_BUSINESS_INVESTMENT` | `비즈니스·투자` 포럼 태그 ID |
| `DISCORD_TAG_INFRA_SEMICONDUCTOR` | `인프라·반도체` 포럼 태그 ID |
| `DISCORD_TAG_POLICY_REGULATION` | `정책·규제` 포럼 태그 ID |
| `DISCORD_TAG_SECURITY_SAFETY` | `보안·안전` 포럼 태그 ID |
| `DISCORD_TAG_USE_CASE` | `활용사례` 포럼 태그 ID |
| `DISCORD_TAG_OTHER` | `기타` 포럼 태그 ID |

### Forum tag rules

각 Discord 포럼 게시물에는 태그를 1개만 적용합니다.

| Tag | Applied to |
| --- | --- |
| `AI 뉴스` | AI타임스 다이제스트 전용 |
| `프롬프트·활용팁` | 프롬프트, 명령어, 사용법, 설정법, 실전 팁 |
| `AI코딩` | Codex, Claude Code, IDE, 개발 도구, 코딩 자동화 |
| `에이전트·자동화` | AI 에이전트, 자율 실행, 업무 자동화 |
| `모델·서비스` | GPT, Claude, Gemini, Grok, Sora 등 모델/서비스 |
| `비즈니스·투자` | 투자, 상장, 인수합병, 파트너십, 실적 |
| `인프라·반도체` | GPU, NPU, 데이터센터, 클라우드, 전력 |
| `정책·규제` | 정부 정책, 규제, 소송, 국가 전략 |
| `보안·안전` | 보안 취약점, AI 안전성, 프라이버시, 악용 위험 |
| `활용사례` | 실무 적용 사례, 산업별 활용, 마케팅/디자인/교육/의료/콘텐츠 제작 사례 |
| `기타` | 위 분류에 명확히 들어가지 않는 AI 관련 게시물 |

소셜/요즘IT/GeekNews 태그는 Claude Haiku 4.5의 Claude API ID `claude-haiku-4-5-20251001`로 먼저 예측합니다. `ANTHROPIC_API_KEY`가 없거나 API 호출이 실패하면 [tag-classifier.js](/Users/kimgayoung/Github/daily-ai-news/tag-classifier.js)의 키워드 룰로 fallback합니다. LLM 호출에는 같은 파일의 `TAG_CLASSIFICATION_PROMPT`를 시스템 프롬프트로 사용하고, 모델 응답의 `tag`가 위 허용 태그 중 하나인지 검증한 뒤 적용합니다.

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

GeekNews는 `https://news.hada.io/new?page=1`과 `page=2`를 확인합니다. 제목 링크가 외부 원문 URL인 글만 전송하고, `topic?id=...`만 있는 내부 질문/토론 글은 제외합니다. Discord 본문은 GeekNews topic 링크에 `utm_source=discord&utm_medium=bot`을 붙인 제목 링크와 최대 4개의 요약 불릿으로 구성됩니다.

### 5. Run AI Times digest

KST 기준 전날 AI타임스 기사 목록을 Discord 포럼 글로 전송합니다. AI타임스 지역뉴스는 제외합니다. 본문이 Discord 제한을 넘으면 첫 포럼 글 안의 후속 댓글로 이어서 전송합니다.

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
- 수동 실행 시 `target_date`와 `dry_run`을 지정할 수 있습니다.
- GitHub Actions 테스트는 `dry_run=true`로 먼저 실행하면 Discord 전송 없이 수집/포맷 결과만 로그로 확인할 수 있습니다.
- 실제 포럼 게시물 전송까지 확인하려면 `dry_run=false`로 실행합니다.

## Project Structure

```text
.
├── .github/workflows/
│   ├── aitimes-digest.yml
│   └── social-monitor.yml
├── aitimes-digest.js
├── monitor.js
├── tag-classifier.js
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
- Discord 포럼 태그 ID가 누락되면 태그 없는 게시물을 보내지 않고 실행을 실패시켜 설정 누락을 드러냅니다.
- `ANTHROPIC_API_KEY`가 누락되거나 Anthropic API 호출이 실패하면 태그 예측만 키워드 룰로 대체하고 Discord 전송은 계속 진행합니다.
- Instagram은 로그인 쿠키 없이 공개 프로필 페이지를 크롤링합니다. Instagram이 특정 계정의 공개 페이지에서 게시물 링크를 숨기면 해당 실행에서는 그 계정을 건너뛰고 다음 실행 때 다시 시도합니다.
- Instagram과 Threads 페이지 구조가 변경되면 수집 로직도 함께 조정해야 할 수 있습니다.
