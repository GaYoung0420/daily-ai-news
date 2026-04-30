# daily-ai-news

## Social monitor

GitHub Actions cron으로 Instagram/Threads 계정의 새 게시물을 확인하고 Discord webhook embed로 알림을 보냅니다.

### GitHub Secrets

- `DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS`
- `DISCORD_WEBHOOK_THREADS_CHOI_OPENAI`

### Commands

```bash
npm ci
npx playwright install chromium
npm run seed
npm run check
```

- `npm run seed`: 현재 최신 게시물들을 `seen.json`에 저장만 하고 Discord로 보내지 않습니다.
- `npm run check`: `seen.json`에 없는 새 게시물만 계정별 Discord webhook으로 보냅니다.

Actions 스케줄은 UTC `30 23,3,9 * * *`이며, KST 기준 08:30, 12:30, 18:30에 실행됩니다.
