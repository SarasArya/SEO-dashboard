// Critical analyzers (§6).
import type { Analyzer, Finding, PageSnapshot } from "@/lib/types";
import { parse, textOf } from "./dom";

// Cart/checkout should typically NOT be indexable — the noindex expectation flips.
const SHOULD_BE_NOINDEX = new Set(["cart", "checkout"]);

// Missing / duplicate canonical tag.
export const canonicalAnalyzer: Analyzer = {
  id: "canonical",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const links = $('link[rel="canonical"]');
    if (links.length === 0) {
      return [
        {
          ruleId: "missing_canonical",
          severity: "critical",
          category: "canonical",
          targetLocator: "head",
          evidence: { found: 0 },
          title: "Missing canonical tag",
          remediation: 'Add a <link rel="canonical" href="…"> pointing to the preferred URL.',
        },
      ];
    }
    if (links.length > 1) {
      const hrefs = links.map((_, el) => $(el).attr("href") ?? "").get();
      return [
        {
          ruleId: "duplicate_canonical",
          severity: "critical",
          category: "canonical",
          targetLocator: "head",
          evidence: { count: links.length, hrefs },
          title: "Duplicate canonical tags",
          remediation: "Keep exactly one canonical link; remove the extras.",
        },
      ];
    }
    return [];
  },
};

// Missing <title> or <h1>.
export const titleH1Analyzer: Analyzer = {
  id: "title_h1",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const findings: Finding[] = [];
    const title = textOf($, "title");
    if (!title) {
      findings.push({
        ruleId: "missing_title",
        severity: "critical",
        category: "content",
        targetLocator: "head > title",
        evidence: { title: null },
        title: "Missing <title>",
        remediation: "Add a descriptive, unique <title> under 60 characters.",
      });
    }
    const h1s = $("h1");
    if (h1s.length === 0) {
      findings.push({
        ruleId: "missing_h1",
        severity: "critical",
        category: "content",
        targetLocator: "body h1",
        evidence: { count: 0 },
        title: "H1 missing",
        remediation: "Add a single, descriptive <h1> summarizing the page.",
      });
    }
    return findings;
  },
};

// noindex on a page that should be indexable — and the flipped expectation for
// cart/checkout (should be noindex; warn if indexable).
export const indexabilityAnalyzer: Analyzer = {
  id: "indexability",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const robots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const hasNoindex = /\bnoindex\b/.test(robots);
    const shouldNoindex = SHOULD_BE_NOINDEX.has(snapshot.pageType);

    if (shouldNoindex) {
      if (!hasNoindex) {
        return [
          {
            ruleId: "should_be_noindex",
            severity: "critical",
            category: "indexability",
            targetLocator: 'meta[name="robots"]',
            evidence: { pageType: snapshot.pageType, robots: robots || null },
            title: "Indexable cart/checkout page",
            remediation: 'Add <meta name="robots" content="noindex"> — these pages should not be indexed.',
          },
        ];
      }
      return [];
    }

    if (hasNoindex) {
      return [
        {
          ruleId: "unexpected_noindex",
          severity: "critical",
          category: "indexability",
          targetLocator: 'meta[name="robots"]',
          evidence: { pageType: snapshot.pageType, robots },
          title: "noindex on an indexable page",
          remediation: "Remove noindex so this page can be crawled and indexed.",
        },
      ];
    }
    return [];
  },
};

// Render gap: key content present in the post-JS DOM but absent from raw HTML.
// PDPs additionally expect price in the raw HTML.
export const renderGapAnalyzer: Analyzer = {
  id: "render_gap",
  run(snapshot: PageSnapshot): Finding[] {
    if (!snapshot.rendered) return []; // cannot diff without a rendered view
    const raw = parse(snapshot.rawHtml);
    const rendered = parse(snapshot.renderedHtml);
    const findings: Finding[] = [];

    const checks: Array<{ key: string; label: string; get: (d: ReturnType<typeof parse>) => string }> = [
      { key: "title", label: "title", get: (d) => d("title").first().text().trim() },
      { key: "h1", label: "H1", get: (d) => d("h1").first().text().trim() },
    ];
    if (snapshot.pageType === "pdp") {
      checks.push({
        key: "price",
        label: "price",
        get: (d) =>
          d('[itemprop="price"], .price, [data-price], [class*="price" i]').first().text().trim(),
      });
    }

    for (const c of checks) {
      const renderedVal = c.get(rendered);
      const rawVal = c.get(raw);
      if (renderedVal && !rawVal) {
        findings.push({
          ruleId: `render_gap_${c.key}`,
          severity: "critical",
          category: "render",
          targetLocator: c.key,
          evidence: { field: c.label, renderedValue: renderedVal.slice(0, 120), inRawHtml: false },
          title: `Render gap: ${c.label} not in raw HTML`,
          remediation: `Server-render the ${c.label} so crawlers see it without executing JS.`,
        });
      }
    }
    return findings;
  },
};

export const criticalAnalyzers: Analyzer[] = [
  canonicalAnalyzer,
  titleH1Analyzer,
  indexabilityAnalyzer,
  renderGapAnalyzer,
];
