// Broken-link checking via real HTTP requests (used on live audits only).
//
// Offline/synthetic audits keep the cheap href heuristic in the analyzer. When
// this runs (live), it extracts same-origin links from the rendered DOM and
// checks them politely, feeding results to the analyzer.
//
// Two lessons baked in to avoid false positives (which destroy trust):
//   * Be a polite crawler — low concurrency, a real User-Agent, follow
//     redirects, retry once on transient codes. Bursty bot-looking traffic gets
//     rate-limited by Shopify/Cloudflare and returns 429/403.
//   * Only a clear dead link counts as "broken". Rate-limit / anti-bot / auth
//     responses (429, 403, 401, 408, 503, 999) are NOT broken links — they mean
//     "we couldn't verify", so we don't flag them.

import * as cheerio from "cheerio";
import type { BrokenLink } from "@/lib/types";

const MAX_LINKS = 40; // cap per page so a huge nav doesn't hammer the origin
const CONCURRENCY = 3; // polite; avoids self-inflicted rate limiting
const TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1500;
const UA =
  "Mozilla/5.0 (compatible; SEO-Health-Dashboard/0.1; +https://example/seo-bot) link-check";

// Statuses that mean "this link is genuinely dead". Everything else — including
// 429 (rate limited), 403/401 (auth/anti-bot), 408, 503 (maintenance/transient),
// 999 (bot block) — is treated as "could not verify" and is NOT reported.
export function isBrokenStatus(status: number): boolean {
  if (status === 0) return true; // network error / timeout (after retry)
  if (status === 404 || status === 410) return true; // not found / gone
  // Real 5xx server errors (500/502/504…), but not 503 (often maintenance /
  // rate-limit) and not out-of-range codes like 999 (anti-bot).
  if (status >= 500 && status <= 599 && status !== 503) return true;
  return false;
}

// Codes worth one retry before we conclude anything.
function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status === 503 || status === 408;
}

export type LinkStatusClass = "ok" | "broken" | "unverified";

// Three-way classification:
//   ok         — 2xx/3xx, the link resolves.
//   broken     — genuinely dead (see isBrokenStatus).
//   unverified — a response came back but we can't conclude (rate-limit /
//                anti-bot / auth, e.g. 429, 403, 401, 408, 503, 999).
export function classifyStatus(status: number): LinkStatusClass {
  if (status >= 200 && status < 400) return "ok";
  if (isBrokenStatus(status)) return "broken";
  return "unverified";
}

export function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const $ = cheerio.load(html || "");
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
    if (/^(mailto:|tel:|data:)/i.test(href)) return;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.origin === origin) {
        abs.hash = "";
        out.add(abs.toString());
      }
    } catch {
      // ignore unparseable hrefs
    }
  });
  return [...out].slice(0, MAX_LINKS);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchStatus(url: string, method: "HEAD" | "GET"): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,*/*",
        ...(method === "GET" ? { range: "bytes=0-0" } : {}),
      },
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(url: string): Promise<number> {
  let status = await fetchStatus(url, "HEAD");
  // Some servers reject HEAD — fall back to a ranged GET.
  if (status === 405 || status === 501 || status === 0) {
    status = await fetchStatus(url, "GET");
  }
  // One polite retry on transient / rate-limit responses before deciding.
  if (isTransient(status)) {
    await sleep(RETRY_DELAY_MS);
    const retry = await fetchStatus(url, "GET");
    if (!isTransient(retry) || retry === 0) status = retry;
  }
  return status;
}

export interface LinkCheckResult {
  broken: BrokenLink[]; // genuinely dead → warning
  unverified: BrokenLink[]; // inconclusive (rate-limit/anti-bot) → info
}

// Check links with bounded concurrency, splitting results into broken vs.
// unverified. OK links produce nothing.
export async function checkLinks(html: string, baseUrl: string): Promise<LinkCheckResult> {
  const links = extractSameOriginLinks(html, baseUrl);
  const broken: BrokenLink[] = [];
  const unverified: BrokenLink[] = [];
  let i = 0;
  async function worker() {
    while (i < links.length) {
      const url = links[i++];
      const status = await checkOne(url);
      const cls = classifyStatus(status);
      if (cls === "broken") broken.push({ url, status });
      else if (cls === "unverified") unverified.push({ url, status });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, links.length) }, worker));
  return { broken, unverified };
}
