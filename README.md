# daily-ai-news

## Social monitor

GitHub Actions cron으로 Instagram/Threads 계정과 RSS 피드의 새 게시물을 확인하고 Discord webhook embed로 알림을 보냅니다.

### GitHub Secrets

- `DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS`
- `DISCORD_WEBHOOK_INSTAGRAM_PROMPPY`
- `DISCORD_WEBHOOK_INSTAGRAM_AI_AINOW`
- `DISCORD_WEBHOOK_THREADS_CHOI_OPENAI`
- `DISCORD_WEBHOOK_YOZM_AI`
- `DISCORD_WEBHOOK_AITIMES_DIGEST`

### Commands

```bash
npm ci
npx playwright install chromium
npm run seed
npm run check
npm run aitimes:digest
```

- `npm run seed`: 현재 최신 게시물들을 `seen.json`에 저장만 하고 Discord로 보내지 않습니다.
- `npm run check`: `seen.json`에 없는 새 게시물만 계정별 Discord webhook으로 보냅니다.
- `npm run aitimes:digest`: KST 기준 전날 AI타임스 기사들을 하나의 Discord 링크 목록으로 보냅니다.

Actions 스케줄은 UTC `0 23 * * *`, `0 0-12 * * *`이며, KST 기준 08:00부터 21:00까지 매시 정각에 실행됩니다.
AI Times Digest 스케줄은 UTC `10 23 * * *`이며, KST 기준 매일 08:10에 전날 기사 목록을 보냅니다.
