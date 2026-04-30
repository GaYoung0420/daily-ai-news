import { XMLParser } from "fast-xml-parser";

const FEED_URL = "https://cdn.aitimes.com/rss/gn_rss_allArticle.xml";
const WEBHOOK_ENV = "DISCORD_WEBHOOK_AITIMES_DIGEST";
const DISCORD_CONTENT_LIMIT = 2000;

const targetDate = process.env.TARGET_DATE || previousKstDate();
const dryRun = process.env.DRY_RUN === "1";

await main();

async function main() {
  console.log(`[aitimes-digest] targetDate=${targetDate}`);

  const articles = await fetchAiTimesArticles();
  const targetArticles = articles.filter((article) => formatKstDate(article.publishedAt) === targetDate);
  console.log(`[aitimes-digest] fetched=${articles.length} matched=${targetArticles.length}`);

  const messages = buildDigestMessages(targetDate, targetArticles);

  if (dryRun) {
    for (const message of messages) {
      console.log(message);
      console.log("---");
    }
    return;
  }

  const webhookUrl = process.env[WEBHOOK_ENV];
  if (!webhookUrl) {
    throw new Error(`Missing GitHub Secret/env ${WEBHOOK_ENV}`);
  }

  for (const message of messages) {
    await sendDiscordMessage(webhookUrl, message);
  }
}

async function fetchAiTimesArticles() {
  const response = await fetch(FEED_URL, {
    headers: {
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    }
  });

  const body = await response.text();
  console.log(`[aitimes-digest] RSS status=${response.status} bytes=${body.length}`);

  if (!response.ok) {
    throw new Error(`AI Times RSS returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });
  const xml = parser.parse(body);
  const items = xml?.rss?.channel?.item;
  const entries = Array.isArray(items) ? items : items ? [items] : [];

  return entries
    .map((item) => {
      const url = normalizeUrl(String(item?.link || item?.guid || ""));
      const title = cleanText(item?.title || "");
      const publishedAt = new Date(item?.pubDate || "");

      return {
        id: url.match(/idxno=([^&#]+)/)?.[1] || url,
        title,
        url,
        publishedAt
      };
    })
    .filter((article) => article.title && article.url && Number.isFinite(article.publishedAt.getTime()))
    .sort((a, b) => a.publishedAt - b.publishedAt);
}

function buildDigestMessages(date, articles) {
  const header = `**AI 타임스 (${date})**`;

  if (articles.length === 0) {
    return [`${header}\n\n전날 등록된 기사가 없습니다.`];
  }

  const lines = articles.map((article) => `- [${escapeMarkdownLinkText(article.title)}](${article.url})`);
  const messages = [];
  let current = `${header}\n\n`;

  for (const line of lines) {
    const next = `${current}${line}\n`;
    if (next.length > DISCORD_CONTENT_LIMIT) {
      messages.push(current.trimEnd());
      current = `**AI 타임스 (${date}, 계속)**\n\n${line}\n`;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    messages.push(current.trimEnd());
  }

  return messages;
}

async function sendDiscordMessage(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        parse: []
      }
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Discord returned ${response.status}: ${body.slice(0, 500)}`);
  }
}

function previousKstDate() {
  const now = new Date();
  return formatKstDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

function formatKstDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function cleanText(text) {
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function escapeMarkdownLinkText(text) {
  return text.replace(/[[\]\\]/g, "\\$&");
}
