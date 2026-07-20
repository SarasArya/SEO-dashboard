// Deterministic synthetic snapshot source.
//
// The audit pipeline (fetcher/renderer/analyzers) is fully live-capable, but the
// demo projects point at example domains with no live target. So both the seed
// and the on-demand trigger build a *deterministic* HTML snapshot for a page on
// a given day and run the REAL analyzers over it. This exercises the entire
// pipeline authentically (real findings → real lifecycle → real scores) while
// staying fully offline and reproducible.
//
// Set LIVE_AUDITS=1 to make the trigger crawl the real URL via buildSnapshot()
// instead.

import type { PageSnapshot, PageType, WebVitals } from "@/lib/types";

// Day 0 of the synthetic narrative is (WINDOW_DAYS - 1) days before today, so
// day index WINDOW_DAYS-1 lands on "today". Seed and the on-demand trigger share
// this anchor so a manual run continues the same storyline.
export const WINDOW_DAYS = 90;

export function anchorDate(now: Date = new Date()): Date {
  const a = new Date(now);
  a.setHours(12, 0, 0, 0); // midday to avoid DST edge effects
  a.setDate(a.getDate() - (WINDOW_DAYS - 1));
  return a;
}

export function dateForDayIndex(dayIndex: number, now: Date = new Date()): Date {
  const d = anchorDate(now);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

export function dayIndexFor(date: Date, now: Date = new Date()): number {
  const a = anchorDate(now).getTime();
  return Math.max(0, Math.round((date.getTime() - a) / 86400000));
}

// A defect profile: which problems exist on the page this run.
export interface DefectProfile {
  missingCanonical: boolean;
  missingTitle: boolean;
  missingH1: boolean;
  renderGapPrice: boolean; // pdp: price only appears post-JS
  indexableWhenShouldNotBe: boolean; // cart/checkout
  metaDescription: "ok" | "missing" | "short";
  multipleH1: boolean;
  missingProductSchema: boolean; // pdp
  brokenLinks: boolean;
  missingAltCount: number;
  legacyImageCount: number;
  nonDescriptiveLink: boolean;
  vitals: WebVitals;
}

// mulberry32 — small deterministic RNG.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The narrative that drives the 90-day trend, per page:
//   * Several issues present early (depressed score).
//   * A cluster gets fixed around day 30-45 (score climbs).
//   * A "deploy" around day ~55 introduces a regression (render gap / noindex
//     / broken links) → visible drop → fixed again by ~day 75.
//   * Info-level issues (alt text, legacy images) fluctuate mildly.
export function defectProfile(pageId: string, pageType: PageType, dayIndex: number): DefectProfile {
  const seed = hashStr(pageId);
  const r = rng(seed + dayIndex * 2654435761);
  const offset = seed % 7; // per-page phase offset so pages differ

  const early = dayIndex < 30 + offset;
  const regressionWindow = dayIndex >= 55 + offset && dayIndex < 75 + offset;

  const isProductLike = pageType === "pdp";
  const shouldNotIndex = pageType === "cart" || pageType === "checkout";

  return {
    missingCanonical: early && (seed % 3 === 0),
    missingTitle: early && (seed % 5 === 0),
    missingH1: early && pageType !== "checkout" && (seed % 2 === 0),
    renderGapPrice: isProductLike && regressionWindow,
    indexableWhenShouldNotBe: shouldNotIndex && regressionWindow,
    metaDescription: early ? (seed % 2 === 0 ? "missing" : "short") : "ok",
    multipleH1: early && (seed % 4 === 0),
    missingProductSchema: isProductLike && dayIndex < 40 + offset,
    brokenLinks: regressionWindow && (seed % 2 === 1),
    missingAltCount: Math.floor(r() * (early ? 4 : 2)),
    legacyImageCount: Math.floor(r() * 3),
    nonDescriptiveLink: r() > 0.6,
    vitals: {
      lcpMs: regressionWindow ? 4200 : 1800 + Math.floor(r() * 500),
      inpMs: 120 + Math.floor(r() * 60),
      cls: regressionWindow ? 0.18 : 0.03,
    },
  };
}

function buildHtml(pageType: PageType, p: DefectProfile): { raw: string; rendered: string } {
  const canonical = p.missingCanonical ? "" : `<link rel="canonical" href="https://example/p">`;
  const title = p.missingTitle ? "" : `<title>${pageType.toUpperCase()} — Quality Goods Online Store</title>`;
  const robots = p.indexableWhenShouldNotBe
    ? ""
    : pageType === "cart" || pageType === "checkout"
      ? `<meta name="robots" content="noindex">`
      : "";
  const metaDesc =
    p.metaDescription === "missing"
      ? ""
      : p.metaDescription === "short"
        ? `<meta name="description" content="Too short.">`
        : `<meta name="description" content="A comfortably sized meta description that sits within the recommended range for search result snippets and reads naturally.">`;
  const productSchema =
    pageType === "pdp" && !p.missingProductSchema
      ? `<script type="application/ld+json">{"@type":"Product","name":"Widget","offers":{"@type":"Offer","price":"29.99"}}</script>`
      : "";

  const head = `<head>${title}${canonical}${robots}${metaDesc}${productSchema}</head>`;

  const h1 = p.missingH1 ? "" : `<h1>${pageType} heading</h1>`;
  const secondH1 = p.multipleH1 ? `<h1>Another heading</h1>` : "";
  const priceRaw = pageType === "pdp" && !p.renderGapPrice ? `<span class="price">$29.99</span>` : "";
  const priceRendered = pageType === "pdp" ? `<span class="price">$29.99</span>` : "";

  const imgs: string[] = [];
  for (let i = 0; i < p.missingAltCount; i++) imgs.push(`<img src="/img/missing-${i}.webp" width="400" height="300">`);
  for (let i = 0; i < p.legacyImageCount; i++) imgs.push(`<img src="/img/legacy-${i}.jpg" alt="ok">`);
  imgs.push(`<img src="/img/hero.webp" alt="Hero" width="800" height="600">`);

  const links = [`<a href="/category">Browse the full category</a>`];
  if (p.brokenLinks) links.push(`<a href="#">go</a>`, `<a href="javascript:void(0)">x</a>`);
  if (p.nonDescriptiveLink) links.push(`<a href="/details">click here</a>`);

  const bodyCommon = `${h1}${secondH1}${imgs.join("")}${links.join("")}`;
  const raw = `<!doctype html><html lang="en">${head}<body>${bodyCommon}${priceRaw}</body></html>`;
  const rendered = `<!doctype html><html lang="en">${head}<body>${bodyCommon}${priceRendered}</body></html>`;
  return { raw, rendered };
}

export function syntheticSnapshot(
  page: { id: string; pageType: PageType; url: string },
  dayIndex: number,
): PageSnapshot {
  const profile = defectProfile(page.id, page.pageType, dayIndex);
  const { raw, rendered } = buildHtml(page.pageType, profile);
  return {
    url: page.url,
    pageType: page.pageType,
    rawHtml: raw,
    renderedHtml: rendered,
    rendered: true,
    isMultiRegion: false,
    vitals: profile.vitals,
  };
}
