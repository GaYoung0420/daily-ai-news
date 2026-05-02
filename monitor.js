import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { XMLParser } from "fast-xml-parser";

const SEEN_FILE = path.resolve("seen.json");
const FETCH_LIMIT = 30;
const MAX_SEEN_PER_ACCOUNT = 200;
const THREADS_MAX_SCROLLS = 6;
const THREADS_SCROLL_PAUSE_MS = 900;
const INSTAGRAM_PAGE_WAIT_MS = 5000;
const DISCORD_DESCRIPTION_LIMIT = 4096;
const DISCORD_TITLE_LIMIT = 256;
const DISCORD_SEND_PAUSE_MS = 600;
const DISCORD_MAX_SEND_ATTEMPTS = 5;
const DISCORD_RATE_LIMIT_FALLBACK_MS = 1000;

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
    key: "instagram:promppy_com",
    platform: "Instagram",
    username: "promppy_com",
    profileUrl: "https://www.instagram.com/promppy_com/",
    webhookEnv: "DISCORD_WEBHOOK_INSTAGRAM_PROMPPY",
    color: 0xff5a5f,
    fetchPosts: fetchInstagramPosts
  },
  {
    key: "instagram:ai.ainow",
    platform: "Instagram",
    username: "ai.ainow",
    profileUrl: "https://www.instagram.com/ai.ainow/",
    webhookEnv: "DISCORD_WEBHOOK_INSTAGRAM_AI_AINOW",
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
  },
  {
    key: "yozm:ai",
    platform: "Yozm IT",
    username: "AI",
    profileUrl: "https://yozm.wishket.com/magazine/list/ai/",
    feedUrl: "https://api.wishket.com/yozmit/news/?category=ai&page=1",
    webhookEnv: "DISCORD_WEBHOOK_YOZM_AI",
    color: 0x5a00db,
    fetchPosts: fetchYozmPosts
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
        await sleep(DISCORD_SEND_PAUSE_MS);
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
  const headers = {
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
  };

  if (process.env.INSTAGRAM_COOKIE) {
    headers.Cookie = process.env.INSTAGRAM_COOKIE;
    const csrfToken = getCookieValue(process.env.INSTAGRAM_COOKIE, "csrftoken");
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }

  const response = await fetch(url, {
    headers
  });

  const body = await response.text();
  console.log(`[${account.key}] Instagram API status=${response.status} bytes=${body.length}`);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(`Instagram API returned 401; add/update GitHub Secret INSTAGRAM_COOKIE. Response: ${body.slice(0, 300)}`);
    }
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
  if (edges.length === 0) {
    const userKeys = Object.keys(json?.data?.user ?? {});
    console.error(`[${account.key}] Instagram API returned 0 timeline edges; user keys=${userKeys.join(",")}; cookie may be incomplete or challenged`);
    return fetchInstagramPostsFromPage(account);
  }

  return edges.slice(0, FETCH_LIMIT).map(({ node }) => {
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

async function fetchInstagramPostsFromPage(account) {
  console.log(`[${account.key}] falling back to Instagram profile page crawl`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"]
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      locale: "ko-KR",
      viewport: { width: 1280, height: 1800 }
    });

    if (process.env.INSTAGRAM_COOKIE) {
      await context.addCookies(parseInstagramCookies(process.env.INSTAGRAM_COOKIE));
    }

    const page = await context.newPage();
    const response = await page.goto(account.profileUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    console.log(`[${account.key}] Instagram page status=${response?.status() ?? "unknown"}`);

    await page.waitForTimeout(INSTAGRAM_PAGE_WAIT_MS);
    const posts = await extractInstagramPosts(page, account.username);

    if (posts.length === 0) {
      const html = await page.content();
      console.error(`[${account.key}] Instagram page crawl found no /${account.username}/p/ or /reel/ links; rendered html bytes=${html.length}`);
      console.error(`[${account.key}] html sample=${html.slice(0, 500).replace(/\s+/g, " ")}`);
    }

    return posts.slice(0, FETCH_LIMIT);
  } finally {
    await browser.close();
  }
}

async function extractInstagramPosts(page, username) {
  return page.evaluate((username) => {
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usernamePattern = escapeRegExp(username);
    const canonicalPostUrl = (href) => {
      try {
        const url = new URL(href, location.href);
        const match = url.pathname.match(new RegExp(`^/${usernamePattern}/(p|reel)/([^/]+)/?$`));
        if (!match) return null;
        url.pathname = `/${username}/${match[1]}/${match[2]}/`;
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return null;
      }
    };
    const scoreImage = (img) => {
      const src = img?.getAttribute("src") ?? "";
      if (!src.startsWith("http")) return -1;
      if (/s150x150|profile|avatar/i.test(src)) return 0;
      return (img.naturalWidth || img.clientWidth || 0) * (img.naturalHeight || img.clientHeight || 0);
    };

    const anchors = [
      ...document.querySelectorAll(`a[href*="/${username}/p/"], a[href*="/${username}/reel/"]`)
    ];
    const byUrl = new Map();

    for (const anchor of anchors) {
      const url = canonicalPostUrl(anchor.getAttribute("href"));
      if (!url || byUrl.has(url)) continue;

      const container = anchor.closest("article, div") ?? anchor;
      const imageCandidates = [
        ...anchor.querySelectorAll("img[src^='http']"),
        ...container.querySelectorAll("img[src^='http']")
      ]
        .map((img) => ({
          src: img.getAttribute("src") ?? "",
          alt: img.getAttribute("alt") ?? "",
          width: img.naturalWidth || img.clientWidth || 0,
          height: img.naturalHeight || img.clientHeight || 0,
          score: scoreImage(img)
        }))
        .filter((image) => image.score > 0)
        .sort((a, b) => b.score - a.score);

      const image = imageCandidates[0];
      const shortcode = url.match(/\/(?:p|reel)\/([^/]+)\//)?.[1] ?? url;
      const timeValue = container.querySelector("time")?.getAttribute("datetime") ?? "";

      byUrl.set(url, {
        id: `instagram:${shortcode}`,
        url,
        text: image?.alt || anchor.getAttribute("aria-label") || "",
        imageUrl: image?.src || "",
        imageWidth: image?.width,
        imageHeight: image?.height,
        timestampMs: timeValue ? Date.parse(timeValue) : undefined
      });
    }

    return [...byUrl.values()];
  }, username);
}

async function fetchYozmPosts(account) {
  const items = [];
  let nextUrl = account.feedUrl;

  while (nextUrl && items.length < FETCH_LIMIT) {
    const response = await fetch(nextUrl, {
      headers: {
        "Accept": "application/json, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://yozm.wishket.com",
        "Referer": account.profileUrl,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
      }
    });

    const body = await response.text();
    console.log(`[${account.key}] Yozm API status=${response.status} bytes=${body.length}`);

    if (!response.ok) {
      throw new Error(`Yozm API returned ${response.status}: ${body.slice(0, 300)}`);
    }

    let json;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw new Error(`Yozm API response was not JSON: ${formatError(error)}; sample=${body.slice(0, 300)}`);
    }

    items.push(...(Array.isArray(json?.results) ? json.results : []));
    nextUrl = json?.next || "";
  }

  return items.slice(0, FETCH_LIMIT).map((item) => {
    const id = item?.id;
    const url = id ? `https://yozm.wishket.com/magazine/detail/${id}/` : account.profileUrl;
    const title = cleanRssText(item?.title || "");
    const description = cleanRssText(item?.description || "");
    const published = Date.parse(item?.repr_date_published || "");

    return {
      id: id ? `yozm:${id}` : `yozm:${url}`,
      url,
      text: [title, description].filter(Boolean).join("\n\n"),
      imageUrl: normalizeAbsoluteUrl(item?.thumbnail_image || "", account.profileUrl),
      timestampMs: Number.isFinite(published) ? published : undefined
    };
  });
}

async function fetchRssPosts(account) {
  const response = await fetch(account.feedUrl, {
    headers: {
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    }
  });

  const body = await response.text();
  console.log(`[${account.key}] RSS status=${response.status} bytes=${body.length}`);

  if (!response.ok) {
    throw new Error(`RSS returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });
  const xml = parser.parse(body);
  const items = xml?.rss?.channel?.item;
  const entries = Array.isArray(items) ? items : items ? [items] : [];

  return entries.slice(0, FETCH_LIMIT).map((item) => {
    const url = normalizePostUrl(String(item?.link || item?.guid || account.profileUrl));
    const title = cleanRssText(item?.title || "");
    const description = cleanRssText(item?.description || "");
    const published = Date.parse(item?.pubDate || item?.["dc:date"] || "");
    const detailId = url.match(/\/magazine\/detail\/([^/?#]+)/)?.[1];

    return {
      id: detailId ? `yozm:${detailId}` : `yozm:${url}`,
      url,
      text: [title, description].filter(Boolean).join("\n\n"),
      timestampMs: Number.isFinite(published) ? published : undefined
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

    await page.waitForTimeout(5000);

    let posts = [];
    for (let attempt = 0; attempt <= THREADS_MAX_SCROLLS; attempt += 1) {
      posts = await extractThreadsPosts(page, account.username);
      console.log(`[${account.key}] Threads crawl attempt=${attempt + 1} posts=${posts.length}`);

      if (posts.length >= FETCH_LIMIT) {
        break;
      }

      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(THREADS_SCROLL_PAUSE_MS);
    }

    if (posts.length === 0) {
      const html = await page.content();
      console.error(`[${account.key}] Threads selector found no /@${account.username}/post/ links; rendered html bytes=${html.length}`);
      console.error(`[${account.key}] html sample=${html.slice(0, 500).replace(/\s+/g, " ")}`);
    }

    return posts.slice(0, FETCH_LIMIT);
  } finally {
    await browser.close();
  }
}

async function extractThreadsPosts(page, username) {
  return page.evaluate((username) => {
      const cleanInlineText = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const cleanBlockText = (value) =>
        (value ?? "")
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n")
          .trim();
      const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      const relativeTimeSource = "(?:\\d+\\s*)?(?:초|분|시간|일|주|개월|년|s|m|h|d|w|mo|y)";
      const authorTimePrefix = new RegExp(`^@?${escapeRegExp(username)}\\s+${relativeTimeSource}\\s*`, "i");
      const looksLikeMetric = (text) =>
        /^[\d,.]+$/.test(text) ||
        /^[\d,.]+[KMB만천]?$/.test(text) ||
        /^(\d[\d,.]*|[KMB]\d+)(\s+\d[\d,.]*){1,4}$/i.test(text);
      const isActionText = (text) =>
        /^(Like|Reply|Repost|Share|좋아요|답글|공유|리포스트|인용|Quote)$/i.test(text);
      const stripNoiseLines = (value) =>
        cleanBlockText(value)
          .split("\n")
          .map((line) => line.replace(authorTimePrefix, "").trim())
          .filter(Boolean)
          .filter((line) => line !== username)
          .filter((line) => line !== `@${username}`)
          .filter((line) => line !== "고정됨")
          .filter((line) => !looksLikeRelativeTime(line))
          .filter((line) => !looksLikeMetric(line))
          .filter((line) => !isActionText(line))
          .filter((line) => !line.includes("님에게 남긴 답글"))
          .join("\n")
          .trim();
      const isPinnedPost = (root) =>
        cleanBlockText(root?.innerText || root?.textContent || "")
          .split("\n")
          .some((line) => line.trim() === "고정됨" || /^Pinned$/i.test(line.trim()));
      const usefulText = (text) =>
        text &&
        !text.startsWith("@") &&
        !looksLikeRelativeTime(text) &&
        !looksLikeMetric(text) &&
        !isActionText(text);
      const scoreImage = (img) => {
        const src = img?.getAttribute("src") ?? "";
        if (!src.startsWith("http")) return -1;
        if (/s150x150|profile|avatar/i.test(src)) return 0;
        return (img.clientWidth || 0) * (img.clientHeight || 0);
      };
      const extractPostText = (root) => {
        const lines = stripNoiseLines(root?.innerText || root?.textContent || "").split("\n");

        while (lines[0] && (lines[0] === username || looksLikeRelativeTime(lines[0]))) {
          lines.shift();
        }

        return lines.join("\n").trim();
      };
      const findPostRoot = (anchor) => {
        let best = null;

        for (let el = anchor; el; el = el.parentElement) {
          const rect = el.getBoundingClientRect();
          const text = extractPostText(el);
          const allPostLinks = [...el.querySelectorAll(`a[href*="/@${username}/post/"]`)]
            .filter((candidate) => canonicalPostUrl(candidate.getAttribute("href"))).length;

          if (rect.width >= 450 && rect.height >= 70 && text.length > 0 && allPostLinks <= 4) {
            best = el;
            break;
          }

          if (rect.width >= 620 && rect.height > 900) {
            break;
          }
        }

        return best ?? anchor.closest("div");
      };
      const hasPinnedRoot = (anchor) => {
        for (let el = anchor; el; el = el.parentElement) {
          const rect = el.getBoundingClientRect();
          if (isPinnedPost(el)) return true;
          if (rect.width >= 620 && rect.height > 900) return false;
        }
        return false;
      };

      const anchors = [...document.querySelectorAll(`a[href*="/@${username}/post/"]`)];
      const byUrl = new Map();

      for (const anchor of anchors) {
        const url = canonicalPostUrl(anchor.getAttribute("href"));
        if (!url) continue;
        if (hasPinnedRoot(anchor)) continue;

        const textCandidates = [];
        const samePostAnchors = anchors.filter((candidate) => canonicalPostUrl(candidate.getAttribute("href")) === url);
        const rootCandidates = [...new Set(samePostAnchors.map(findPostRoot).filter(Boolean))];

        for (const root of rootCandidates) {
          const text = extractPostText(root);
          if (usefulText(cleanInlineText(text))) textCandidates.push(text);
        }

        for (const candidate of samePostAnchors) {
          const text = stripNoiseLines(candidate.innerText || candidate.textContent);
          if (usefulText(text)) textCandidates.push(text);
        }

        const container = rootCandidates[0] ?? anchor.closest("div");
        if (container) {
          for (const el of container.querySelectorAll("span, div")) {
            const text = stripNoiseLines(el.innerText || el.textContent);
            if (usefulText(text)) {
              textCandidates.push(text);
            }
          }
        }

        const text = [...new Set(textCandidates)]
          .filter((candidate) => candidate.length > 10)
          .sort((a, b) => {
            const aLines = a.split("\n").length;
            const bLines = b.split("\n").length;
            if (aLines !== bLines) return bLines - aLines;
            return b.length - a.length;
          })[0] ?? "";

        const imageCandidates = [
          ...samePostAnchors.flatMap((candidate) => [...candidate.querySelectorAll("img[src^='http']")]),
          ...[...(container?.querySelectorAll("img[src^='http']") ?? [])]
        ]
          .map((img) => ({
            src: img.getAttribute("src") ?? "",
            width: img.naturalWidth || img.clientWidth || 0,
            height: img.naturalHeight || img.clientHeight || 0,
            score: scoreImage(img)
          }))
          .filter((image) => image.score > 0)
          .sort((a, b) => b.score - a.score);

        const image = imageCandidates[0];
        const timeValue = container?.querySelector("time")?.getAttribute("datetime") ?? "";

        const previous = byUrl.get(url);
        const post = {
          id: `threads:${url.split("/post/")[1]?.replace(/\/$/, "") || url}`,
          url,
          text: text || previous?.text || "",
          imageUrl: image?.src || previous?.imageUrl || "",
          imageWidth: image?.width || previous?.imageWidth,
          imageHeight: image?.height || previous?.imageHeight,
          timestampMs: timeValue ? Date.parse(timeValue) : previous?.timestampMs
        };

        byUrl.set(url, post);
      }

      return [...byUrl.values()];
    }, username);
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
      imageUrl: normalizeAbsoluteUrl(post.imageUrl || "", account.profileUrl),
      imageWidth: Number.isFinite(post.imageWidth) ? post.imageWidth : undefined,
      imageHeight: Number.isFinite(post.imageHeight) ? post.imageHeight : undefined,
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

  if (post.imageUrl && shouldUseLargeEmbedImage(post)) {
    embed.image = { url: post.imageUrl };
  } else if (post.imageUrl) {
    embed.thumbnail = { url: post.imageUrl };
  }

  const payload = {
    embeds: [embed],
    allowed_mentions: {
      parse: []
    }
  };

  for (let attempt = 1; attempt <= DISCORD_MAX_SEND_ATTEMPTS; attempt += 1) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = await response.text();
    if (response.ok) {
      return;
    }

    if (response.status === 429 && attempt < DISCORD_MAX_SEND_ATTEMPTS) {
      const retryAfterMs = getDiscordRetryAfterMs(response, body);
      console.warn(`[${account.key}] Discord rate limited; retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${DISCORD_MAX_SEND_ATTEMPTS})`);
      await sleep(retryAfterMs);
      continue;
    }

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

function normalizeAbsoluteUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
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

function cleanRssText(text) {
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

function parseInstagramCookies(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index === -1) return null;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!name) return null;
      return {
        name,
        value,
        domain: ".instagram.com",
        path: "/",
        secure: true,
        sameSite: "Lax"
      };
    })
    .filter(Boolean);
}

function getCookieValue(cookie, name) {
  return cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] || "";
}

function getDiscordRetryAfterMs(response, body) {
  const headerValue = response.headers.get("retry-after") || response.headers.get("x-ratelimit-reset-after");
  const headerSeconds = Number(headerValue);
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
    return Math.ceil(headerSeconds * 1000) + 100;
  }

  try {
    const json = JSON.parse(body);
    const retryAfterSeconds = Number(json?.retry_after);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds * 1000) + 100;
    }
  } catch {
    // Fall back below when Discord returns a non-JSON error body.
  }

  return DISCORD_RATE_LIMIT_FALLBACK_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, limit) {
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function shouldUseLargeEmbedImage(post) {
  if (!post.imageWidth || !post.imageHeight) return true;
  const ratio = post.imageWidth / post.imageHeight;
  return ratio >= 0.45 && ratio <= 2.2;
}

function formatError(error) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ""}`.trim();
  }
  return String(error);
}
