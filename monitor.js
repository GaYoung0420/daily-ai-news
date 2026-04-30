import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const SEEN_FILE = path.resolve("seen.json");
const MAX_SEEN_PER_ACCOUNT = 80;
const DISCORD_DESCRIPTION_LIMIT = 4096;
const DISCORD_TITLE_LIMIT = 256;

const ACCOUNTS = [
  {
    key: "instagram:ai_freaks.kr",
    platform: "Instagram",
    username: "ai_freaks.kr",
    profileUrl: "https://www.instagram.com/ai_freaks.kr/",
    webhookEnv: "DISCORD_WEBHOOK_INSTAGRAM_AI_FREAKS",
    color: 0xff5a5f,
    fetchPosts: fetchInstagramPosts
  },
  {
    key: "threads:choi.openai",
    platform: "Threads",
    username: "choi.openai",
    profileUrl: "https://www.threads.com/@choi.openai",
    webhookEnv: "DISCORD_WEBHOOK_THREADS_CHOI_OPENAI",
    color: 0x222222,
    fetchPosts: fetchThreadsPosts
  }
];

const mode = process.argv[2] ?? "check";

if (!["check", "seed"].includes(mode)) {
  console.error(`Unknown mode "${mode}". Use "check" or "seed".`);
  process.exit(1);
}

await main(mode);

async function main(runMode) {
  console.log(`[monitor] mode=${runMode}`);
  const seen = await readSeen();
  let changed = false;
  let hadFailure = false;

  for (const account of ACCOUNTS) {
    console.log(`[${account.key}] fetching latest posts from ${account.profileUrl}`);

    let posts = [];
    try {
      posts = await account.fetchPosts(account);
    } catch (error) {
      console.error(`[${account.key}] fetch failed; keeping existing seen state unchanged: ${formatError(error)}`);
      continue;
    }

    posts = normalizePosts(posts, account);
    console.log(`[${account.key}] extracted ${posts.length} post(s)`);

    if (posts.length === 0) {
      console.error(`[${account.key}] no posts found; keeping existing seen state unchanged`);
      continue;
    }

    const entry = ensureSeenEntry(seen, account.key);
    const known = new Set(entry.items);
    const latestIds = posts.map((post) => post.id);

    if (runMode === "seed") {
      changed = mergeSeen(entry, latestIds) || changed;
      console.log(`[${account.key}] seeded ${latestIds.length} current post id/url(s), no Discord messages sent`);
      continue;
    }

    const newPosts = posts
      .filter((post) => !known.has(post.id))
      .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));

    if (newPosts.length === 0) {
      console.log(`[${account.key}] no new posts`);
      continue;
    }

    const webhookUrl = process.env[account.webhookEnv];
    if (!webhookUrl) {
      hadFailure = true;
      console.error(`[${account.key}] missing GitHub Secret/env ${account.webhookEnv}; not marking new posts as seen`);
      continue;
    }

    for (const post of newPosts) {
      try {
        await sendDiscordEmbed(account, post, webhookUrl);
        changed = mergeSeen(entry, [post.id]) || changed;
        console.log(`[${account.key}] sent Discord alert: ${post.url}`);
      } catch (error) {
        hadFailure = true;
        console.error(`[${account.key}] Discord send failed for ${post.url}: ${formatError(error)}`);
      }
    }
  }

  if (changed) {
    await writeSeen(seen);
    console.log(`[monitor] wrote ${SEEN_FILE}`);
  } else {
    console.log("[monitor] seen state unchanged");
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

async function fetchInstagramPosts(account) {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(account.username)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "*/*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Referer": account.profileUrl,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "X-ASBD-ID": "129477",
      "X-Requested-With": "XMLHttpRequest",
      "X-IG-App-ID": "936619743392459"
    }
  });

  const body = await response.text();
  console.log(`[${account.key}] Instagram API status=${response.status} bytes=${body.length}`);

  if (!response.ok) {
    throw new Error(`Instagram API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (error) {
    throw new Error(`Instagram API response was not JSON: ${formatError(error)}; sample=${body.slice(0, 300)}`);
  }

  const edges = json?.data?.user?.edge_owner_to_timeline_media?.edges;
  if (!Array.isArray(edges)) {
    const keys = Object.keys(json?.data?.user ?? {});
    throw new Error(`Instagram API JSON did not include edge_owner_to_timeline_media.edges; user keys=${keys.join(",")}`);
  }

  return edges.slice(0, 6).map(({ node }) => {
    const shortcode = node?.shortcode;
    const caption = node?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
    const takenAt = Number.isFinite(node?.taken_at_timestamp) ? node.taken_at_timestamp * 1000 : undefined;

    return {
      id: shortcode ? `instagram:${shortcode}` : node?.id,
      url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : account.profileUrl,
      text: caption,
      imageUrl: node?.display_url ?? node?.thumbnail_src,
      timestampMs: takenAt
    };
  });
}

async function fetchThreadsPosts(account) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"]
  });

  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      locale: "ko-KR",
      viewport: { width: 1280, height: 1800 }
    });

    const response = await page.goto(account.profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    console.log(`[${account.key}] Threads page status=${response?.status() ?? "unknown"}`);

    await page.waitForTimeout(8000);

    const posts = await page.evaluate((username) => {
      const cleanText = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const canonicalPostUrl = (href) => {
        try {
          const url = new URL(href, location.href);
          const match = url.pathname.match(new RegExp(`^/@${username}/post/([^/]+)/?$`));
          if (!match) return null;
          url.pathname = `/@${username}/post/${match[1]}`;
          url.search = "";
          url.hash = "";
          return url.toString();
        } catch {
          return null;
        }
      };
      const looksLikeRelativeTime = (text) =>
        /^(\d+\s*)?(초|분|시간|일|주|개월|년)$/.test(text) ||
        /^(\d+\s*)?(s|m|h|d|w|mo|y)$/i.test(text);
      const isActionText = (text) =>
        /^(Like|Reply|Repost|Share|좋아요|답글|공유|리포스트|인용|Quote)$/i.test(text);
      const usefulText = (text) =>
        text &&
        !text.startsWith("@") &&
        !looksLikeRelativeTime(text) &&
        !isActionText(text);
      const scoreImage = (img) => {
        const src = img?.getAttribute("src") ?? "";
        if (!src.startsWith("http")) return -1;
        if (/s150x150|profile|avatar/i.test(src)) return 0;
        return (img.clientWidth || 0) * (img.clientHeight || 0);
      };

      const anchors = [...document.querySelectorAll(`a[href*="/@${username}/post/"]`)];
      const byUrl = new Map();

      for (const anchor of anchors) {
        const url = canonicalPostUrl(anchor.getAttribute("href"));
        if (!url) continue;

        const container =
          anchor.closest("article") ??
          anchor.closest('[role="article"]') ??
          anchor.closest("div:has(time)") ??
          anchor.closest("div");

        const textCandidates = [];
        const samePostAnchors = anchors.filter((candidate) => canonicalPostUrl(candidate.getAttribute("href")) === url);
        for (const candidate of samePostAnchors) {
          const text = cleanText(candidate.innerText || candidate.textContent);
          if (usefulText(text)) textCandidates.push(text);
        }

        if (container) {
          for (const el of container.querySelectorAll("span, div")) {
            const text = cleanText(el.innerText || el.textContent);
            if (usefulText(text)) {
              textCandidates.push(text);
            }
          }
        }

        const text = [...new Set(textCandidates)]
          .sort((a, b) => b.length - a.length)
          .find((candidate) => candidate.length > 10) ?? "";

        const imageCandidates = [
          ...samePostAnchors.flatMap((candidate) => [...candidate.querySelectorAll("img[src^='http']")]),
          ...[...(container?.querySelectorAll("img[src^='http']") ?? [])]
        ]
          .map((img) => ({ src: img.getAttribute("src") ?? "", score: scoreImage(img) }))
          .filter((image) => image.score > 0)
          .sort((a, b) => b.score - a.score);

        const image = imageCandidates[0]?.src ?? "";
        const timeValue = container?.querySelector("time")?.getAttribute("datetime") ?? "";

        const previous = byUrl.get(url);
        const post = {
          id: `threads:${url.split("/post/")[1]?.replace(/\/$/, "") || url}`,
          url,
          text: text || previous?.text || "",
          imageUrl: image || previous?.imageUrl || "",
          timestampMs: timeValue ? Date.parse(timeValue) : previous?.timestampMs
        };

        byUrl.set(url, post);
      }

      return [...byUrl.values()];
    }, account.username);

    if (posts.length === 0) {
      const html = await page.content();
      console.error(`[${account.key}] Threads selector found no /@${account.username}/post/ links; rendered html bytes=${html.length}`);
      console.error(`[${account.key}] html sample=${html.slice(0, 500).replace(/\s+/g, " ")}`);
    }

    return posts.slice(0, 6);
  } finally {
    await browser.close();
  }
}

function normalizePosts(posts, account) {
  const result = [];
  const seenIds = new Set();

  for (const post of posts) {
    if (!post?.url && !post?.id) continue;
    const url = normalizePostUrl(post.url || account.profileUrl);
    const id = post.id || url;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    result.push({
      id,
      url,
      text: cleanDiscordText(post.text || ""),
      imageUrl: post.imageUrl || "",
      timestampMs: Number.isFinite(post.timestampMs) ? post.timestampMs : undefined
    });
  }

  return result;
}

async function sendDiscordEmbed(account, post, webhookUrl) {
  const timestamp = post.timestampMs ? new Date(post.timestampMs).toISOString() : new Date().toISOString();
  const description = truncate(post.text || `${account.platform} @${account.username} 새 게시물`, DISCORD_DESCRIPTION_LIMIT);
  const title = truncate(firstMeaningfulLine(post.text) || `${account.platform} @${account.username} 새 게시물`, DISCORD_TITLE_LIMIT);
  const host = new URL(account.profileUrl).hostname.replace(/^www\./, "");

  const embed = {
    title,
    url: post.url,
    description,
    color: account.color,
    footer: {
      text: `${account.username} | ${host}`
    },
    timestamp
  };

  if (post.imageUrl) {
    embed.image = { url: post.imageUrl };
  }

  const payload = {
    username: "NEWS-ALERTS-BOT",
    embeds: [embed],
    allowed_mentions: {
      parse: []
    }
  };

  const response = await fetch(webhookUrl, {
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
}

async function readSeen() {
  try {
    const raw = await fs.readFile(SEEN_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeSeen(seen) {
  await fs.writeFile(SEEN_FILE, `${JSON.stringify(seen, null, 2)}\n`);
}

function ensureSeenEntry(seen, key) {
  if (!seen[key] || !Array.isArray(seen[key].items)) {
    seen[key] = { items: [], updatedAt: null };
  }
  return seen[key];
}

function mergeSeen(entry, ids) {
  const before = JSON.stringify(entry.items);
  entry.items = [...new Set([...ids, ...entry.items])].slice(0, MAX_SEEN_PER_ACCOUNT);
  entry.updatedAt = new Date().toISOString();
  return JSON.stringify(entry.items) !== before;
}

function normalizePostUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function firstMeaningfulLine(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function cleanDiscordText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function truncate(text, limit) {
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function formatError(error) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ""}`.trim();
  }
  return String(error);
}
