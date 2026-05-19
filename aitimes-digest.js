import { XMLParser } from "fast-xml-parser";
import { buildForumWebhookFields, tagLabel } from "./tag-classifier.js";

const FEED_URL = "https://cdn.aitimes.com/rss/gn_rss_allArticle.xml";
const LIST_URL = "https://www.aitimes.com/news/articleList.html?sc_order_by=E&view_type=sm";
const PAGING_URL = "https://www.aitimes.com/news/ajaxArticlePaging.php";
const WEBHOOK_ENV = "DISCORD_WEBHOOK_AITIMES_DIGEST";
const DISCORD_CONTENT_LIMIT = 2000;
const LIST_PER_PAGE = 20;
const MAX_LIST_PAGES = 200;
const EXCLUDED_SECTIONS = new Set(["지역뉴스"]);

const targetDate = process.env.TARGET_DATE || previousKstDate();
const dryRun = process.env.DRY_RUN === "1";

await main();

async function main() {
  console.log(`[aitimes-digest] targetDate=${targetDate}`);

  const articles = await fetchAiTimesArticles(targetDate);
  const targetArticles = articles.filter((article) => formatKstDate(article.publishedAt) === targetDate);
  console.log(`[aitimes-digest] fetched=${articles.length} matched=${targetArticles.length}`);

  const messages = buildDigestMessages(targetDate, targetArticles);

  if (dryRun) {
    for (const message of messages) {
      console.log(`[tag] ${tagLabel("AI_NEWS")}`);
      console.log(`[title] ${message.title}`);
      console.log(message.content);
      console.log("---");
    }
    return;
  }

  const webhookUrl = process.env[WEBHOOK_ENV];
  if (!webhookUrl) {
    throw new Error(`Missing GitHub Secret/env ${WEBHOOK_ENV}`);
  }

  await sendDiscordDigestMessages(webhookUrl, messages);
}

async function fetchAiTimesArticles(date) {
  try {
    return await fetchAiTimesArticlesFromList(date);
  } catch (error) {
    console.warn(`[aitimes-digest] article list failed; falling back to RSS: ${error.message}`);
    return fetchAiTimesArticlesFromRss();
  }
}

async function fetchAiTimesArticlesFromList(date) {
  const total = await fetchArticleTotal();
  const articles = new Map();
  let reachedPastTargetDate = false;

  for (let page = 1; page <= MAX_LIST_PAGES && !reachedPastTargetDate; page += 1) {
    const entries = await fetchArticleListPage(total, page);
    console.log(`[aitimes-digest] list page=${page} items=${entries.length}`);

    if (entries.length === 0) {
      break;
    }

    reachedPastTargetDate = entries.every((entry) => entry.date < date);

    for (const entry of entries) {
      if (entry.date !== date || isExcludedSection(entry.section)) {
        continue;
      }

      articles.set(entry.id, entry);
    }
  }

  return [...articles.values()].sort((a, b) => a.publishedAt - b.publishedAt);
}

async function fetchArticleTotal() {
  const response = await fetch(LIST_URL, { headers: aiTimesHeaders() });
  const body = await response.text();
  console.log(`[aitimes-digest] list status=${response.status} bytes=${body.length}`);

  if (!response.ok) {
    throw new Error(`AI Times list returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const total = body.match(/altlist-count[\s\S]*?<strong>([\d,]+)<\/strong>/)?.[1]?.replace(/,/g, "");
  if (!total) {
    throw new Error("Unable to find AI Times article total");
  }

  return total;
}

async function fetchArticleListPage(total, page) {
  const url = new URL(PAGING_URL);
  url.search = new URLSearchParams({
    total,
    list_per_page: String(LIST_PER_PAGE),
    page_per_page: "10",
    page: String(page),
    sc_section_code: "",
    sc_sub_section_code: "",
    sc_serial_code: "",
    sc_area: "",
    sc_level: "",
    sc_article_type: "",
    sc_view_level: "",
    sc_sdate: "",
    sc_edate: "",
    sc_serial_number: "",
    sc_word: "",
    sc_word2: "",
    sc_andor: "",
    sc_order_by: "E",
    view_type: "",
    sc_multi_code: "",
    sc_is_image: "",
    sc_is_movie: "",
    sc_user_name: "",
    box_idxno: "0"
  });

  const response = await fetch(url, {
    headers: {
      ...aiTimesHeaders(),
      "Referer": LIST_URL,
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`AI Times list page ${page} returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = JSON.parse(body);
  if (json.result !== "success" || !Array.isArray(json.data)) {
    throw new Error(`AI Times list page ${page} returned unexpected payload: ${body.slice(0, 300)}`);
  }

  return json.data
    .map(parseListArticle)
    .filter(Boolean);
}

function parseListArticle(item) {
  const id = String(item?.idxno || "");
  const date = String(item?.recognition_date || item?.approve_date || item?.pub_date || "").slice(0, 10);
  const time = String(item?.recognition_time || item?.viewTime || "00:00").slice(0, 5);
  const title = cleanText(decodeHtmlEntities(item?.title || ""));
  const section = cleanText(decodeHtmlEntities(item?.sectionTitle || ""));
  const publishedAt = new Date(`${date}T${time}:00+09:00`);

  if (!id || !title || !date || !Number.isFinite(publishedAt.getTime())) {
    return null;
  }

  return {
    id,
    title,
    url: `https://www.aitimes.com/news/articleView.html?idxno=${encodeURIComponent(id)}`,
    section,
    publishedAt,
    date
  };
}

async function fetchAiTimesArticlesFromRss() {
  const response = await fetch(FEED_URL, {
    headers: aiTimesHeaders("application/rss+xml, application/xml, text/xml, */*")
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
        section: cleanText(item?.category || ""),
        publishedAt
      };
    })
    .filter((article) => article.title && article.url && Number.isFinite(article.publishedAt.getTime()))
    .filter((article) => !isExcludedSection(article.section))
    .sort((a, b) => a.publishedAt - b.publishedAt);
}

function aiTimesHeaders(accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
  return {
    "Accept": accept,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  };
}

function isExcludedSection(section) {
  return EXCLUDED_SECTIONS.has(cleanText(section));
}

function buildDigestMessages(date, articles) {
  const header = `**AI 타임스 (${date})**`;

  if (articles.length === 0) {
    return [{
      title: `AI 타임스 (${date})`,
      content: `${header}\n\n전날 등록된 기사가 없습니다.`
    }];
  }

  const lines = articles.map((article) => `- [${escapeMarkdownLinkText(article.title)}](${article.url})`);
  const messages = [];
  let current = `${header}\n\n`;
  let part = 1;

  for (const line of lines) {
    const next = `${current}${line}\n`;
    if (next.length > DISCORD_CONTENT_LIMIT) {
      messages.push({
        title: `AI 타임스 (${date})${part > 1 ? ` ${part}` : ""}`,
        content: current.trimEnd()
      });
      part += 1;
      current = `**AI 타임스 (${date}, 계속)**\n\n${line}\n`;
    } else {
      current = next;
    }
  }

  if (current.trim()) {
    messages.push({
      title: `AI 타임스 (${date})${part > 1 ? ` ${part}` : ""}`,
      content: current.trimEnd()
    });
  }

  return messages;
}

async function sendDiscordDigestMessages(webhookUrl, messages) {
  const [firstMessage, ...remainingMessages] = messages;
  const threadId = await createDiscordForumThread(webhookUrl, firstMessage);

  for (const message of remainingMessages) {
    await sendDiscordThreadMessage(webhookUrl, threadId, message);
  }
}

async function createDiscordForumThread(webhookUrl, message) {
  const responseBody = await executeDiscordWebhook(webhookUrl, {
    wait: "true"
  }, {
    ...buildForumWebhookFields({
      title: message.title,
      tagKey: "AI_NEWS",
      requireTag: true
    }),
    content: message.content,
    allowed_mentions: {
      parse: []
    }
  });

  const threadId = responseBody?.channel_id || responseBody?.id;
  if (!threadId) {
    throw new Error(`Discord webhook response did not include a thread id: ${JSON.stringify(responseBody).slice(0, 500)}`);
  }

  return threadId;
}

async function sendDiscordThreadMessage(webhookUrl, threadId, message) {
  await executeDiscordWebhook(webhookUrl, {
    thread_id: threadId,
    wait: "true"
  }, {
    content: message.content,
    allowed_mentions: {
      parse: []
    }
  });
}

async function executeDiscordWebhook(webhookUrl, query, payload) {
  const url = new URL(webhookUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Discord returned ${response.status}: ${body.slice(0, 500)}`);
  }

  if (!body) {
    return null;
  }

  return JSON.parse(body);
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

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
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
