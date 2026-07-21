// Broken-link checking via real HTTP requests (used on live audits only).
//
// Offline/synthetic audits keep the cheap href heuristic in the analyzer. When
// this runs (live), it extracts same-origin links from the rendered DOM and
// HEAD-checks them with bounded concurrency, feeding results to the analyzer.

import * as cheerio from "cheerio";
import type { BrokenLink } from "@/lib/types";

const MAX_LINKS = 50; // cap per page so a huge nav doesn't explode the run
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

// Pure, unit-testable: absolute same-origin links found in the HTML.
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

async function headStatus(url: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some servers reject HEAD (405) — retry with a ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { range: "bytes=0-0" },
      });
    }
    return res.status;
  } catch {
    return 0; // network error / timeout
  } finally {
    clearTimeout(timer);
  }
}

// Check links with bounded concurrency; return only the broken ones.
export async function findBrokenLinks(html: string, baseUrl: string): Promise<BrokenLink[]> {
  const links = extractSameOriginLinks(html, baseUrl);
  const broken: BrokenLink[] = [];
  let i = 0;
  async function worker() {
    while (i < links.length) {
      const url = links[i++];
      const status = await headStatus(url);
      if (status === 0 || status >= 400) broken.push({ url, status });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, links.length) }, worker));
  return broken;
}
