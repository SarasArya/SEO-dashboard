// Warning analyzers (§6).
import type { Analyzer, Finding, PageSnapshot } from "@/lib/types";
import { CWV_THRESHOLDS } from "@/lib/config";
import { parse } from "./dom";

const META_DESC_MIN = 70;
const META_DESC_MAX = 160;

export const metaDescriptionAnalyzer: Analyzer = {
  id: "meta_description",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const content = $('meta[name="description"]').attr("content");
    if (content == null) {
      return [
        {
          ruleId: "meta_description_missing",
          severity: "warning",
          category: "meta",
          targetLocator: 'meta[name="description"]',
          evidence: { present: false },
          title: "Meta description missing",
          remediation: `Add a meta description between ${META_DESC_MIN}-${META_DESC_MAX} characters.`,
        },
      ];
    }
    const len = content.trim().length;
    if (len < META_DESC_MIN) {
      return [
        {
          ruleId: "meta_description_short",
          severity: "warning",
          category: "meta",
          targetLocator: 'meta[name="description"]',
          evidence: { length: len, min: META_DESC_MIN },
          title: "Meta description too short",
          remediation: `Expand the meta description to at least ${META_DESC_MIN} characters.`,
        },
      ];
    }
    if (len > META_DESC_MAX) {
      return [
        {
          ruleId: "meta_description_long",
          severity: "warning",
          category: "meta",
          targetLocator: 'meta[name="description"]',
          evidence: { length: len, max: META_DESC_MAX },
          title: "Meta description too long",
          remediation: `Trim the meta description to at most ${META_DESC_MAX} characters.`,
        },
      ];
    }
    return [];
  },
};

// Multiple H1s or a broken heading hierarchy (e.g. an h3 with no preceding h2).
export const headingHierarchyAnalyzer: Analyzer = {
  id: "heading_hierarchy",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const findings: Finding[] = [];
    const h1s = $("h1");
    if (h1s.length > 1) {
      findings.push({
        ruleId: "multiple_h1",
        severity: "warning",
        category: "content",
        targetLocator: "body h1",
        evidence: { count: h1s.length },
        title: "Multiple H1 tags",
        remediation: "Use a single H1 per page; demote the others to H2/H3.",
      });
    }
    const levels: number[] = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      levels.push(Number((el as { tagName?: string }).tagName?.[1] ?? "0"));
    });
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        findings.push({
          ruleId: "broken_heading_hierarchy",
          severity: "warning",
          category: "content",
          targetLocator: `heading#${i}`,
          evidence: { from: `h${levels[i - 1]}`, to: `h${levels[i]}` },
          title: "Broken heading hierarchy",
          remediation: "Do not skip heading levels (e.g. H2 → H4); keep the outline sequential.",
        });
        break; // one finding per page is enough signal
      }
    }
    return findings;
  },
};

// Missing / invalid structured data. PDPs expect Product; most pages benefit
// from BreadcrumbList.
export const structuredDataAnalyzer: Analyzer = {
  id: "structured_data",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const blocks: unknown[] = [];
    let hasInvalid = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        hasInvalid = true;
      }
    });
    const findings: Finding[] = [];
    if (hasInvalid) {
      findings.push({
        ruleId: "invalid_structured_data",
        severity: "warning",
        category: "structured-data",
        targetLocator: 'script[type="application/ld+json"]',
        evidence: { parseError: true },
        title: "Invalid structured data (JSON-LD does not parse)",
        remediation: "Fix the JSON-LD so it is valid JSON.",
      });
    }
    const types = new Set<string>();
    for (const b of blocks) collectTypes(b, types);
    if (snapshot.pageType === "pdp" && !types.has("Product")) {
      findings.push({
        ruleId: "missing_product_schema",
        severity: "warning",
        category: "structured-data",
        targetLocator: "head",
        evidence: { foundTypes: [...types] },
        title: "Missing Product structured data",
        remediation: "Add Product JSON-LD (name, price, availability) so PDPs qualify for rich results.",
      });
    }
    return findings;
  },
};

function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
    return;
  }
  if (node && typeof node === "object") {
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") out.add(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
    for (const v of Object.values(node as Record<string, unknown>)) collectTypes(v, out);
  }
}

// Broken internal links.
//   * Live audits: `snapshot.brokenLinks` holds same-origin URLs that returned
//     4xx/5xx/unreachable from real HTTP checks — one finding per URL, keyed by
//     the URL so each is tracked individually across runs.
//   * Offline: fall back to a heuristic (empty / "#" / javascript: hrefs).
export const brokenLinkAnalyzer: Analyzer = {
  id: "broken_links",
  run(snapshot: PageSnapshot): Finding[] {
    if (snapshot.brokenLinks) {
      const findings: Finding[] = snapshot.brokenLinks.map((b) => ({
        ruleId: "broken_internal_link",
        severity: "warning" as const,
        category: "links" as const,
        targetLocator: b.url,
        evidence: { url: b.url, status: b.status || "unreachable" },
        title: "Broken internal link",
        remediation: `Fix or remove the link to ${b.url} (returned ${b.status || "no response"}).`,
      }));
      // "Couldn't verify" bucket: a response came back but was inconclusive
      // (rate-limit / anti-bot / auth). Surfaced as info, not a false alarm.
      for (const u of snapshot.unverifiedLinks ?? []) {
        findings.push({
          ruleId: "link_unverified",
          severity: "info",
          category: "links",
          targetLocator: u.url,
          evidence: { url: u.url, status: u.status },
          title: "Link could not be verified",
          remediation: `The link to ${u.url} returned ${u.status} (rate-limit or anti-bot). Verify manually — it is likely fine.`,
        });
      }
      return findings;
    }

    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const bad: string[] = [];
    $("a").each((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      if (href === "" || href === "#" || href.toLowerCase().startsWith("javascript:")) {
        bad.push(href || "(empty)");
      }
    });
    if (bad.length === 0) return [];
    return [
      {
        ruleId: "broken_internal_links",
        severity: "warning",
        category: "links",
        targetLocator: "body a[href]",
        evidence: { count: bad.length, samples: bad.slice(0, 5) },
        title: "Broken internal links",
        remediation: 'Point anchors at real URLs; avoid empty, "#", or javascript: hrefs.',
      },
    ];
  },
};

// Missing hreflang on a multi-region page.
export const hreflangAnalyzer: Analyzer = {
  id: "hreflang",
  run(snapshot: PageSnapshot): Finding[] {
    if (!snapshot.isMultiRegion) return [];
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const alternates = $('link[rel="alternate"][hreflang]');
    if (alternates.length === 0) {
      return [
        {
          ruleId: "missing_hreflang",
          severity: "warning",
          category: "i18n",
          targetLocator: "head",
          evidence: { alternates: 0, multiRegion: true },
          title: "Missing hreflang",
          remediation: 'Add <link rel="alternate" hreflang="…"> tags for each region variant.',
        },
      ];
    }
    return [];
  },
};

// Core Web Vitals below threshold (via Lighthouse-style metrics on the snapshot).
export const coreWebVitalsAnalyzer: Analyzer = {
  id: "core_web_vitals",
  run(snapshot: PageSnapshot): Finding[] {
    const v = snapshot.vitals;
    if (!v) return [];
    const findings: Finding[] = [];
    if (v.lcpMs != null && v.lcpMs > CWV_THRESHOLDS.lcpMs) {
      findings.push(cwvFinding("lcp", "LCP", `${v.lcpMs}ms`, `${CWV_THRESHOLDS.lcpMs}ms`));
    }
    if (v.inpMs != null && v.inpMs > CWV_THRESHOLDS.inpMs) {
      findings.push(cwvFinding("inp", "INP", `${v.inpMs}ms`, `${CWV_THRESHOLDS.inpMs}ms`));
    }
    if (v.cls != null && v.cls > CWV_THRESHOLDS.cls) {
      findings.push(cwvFinding("cls", "CLS", `${v.cls}`, `${CWV_THRESHOLDS.cls}`));
    }
    return findings;
  },
};

function cwvFinding(metric: string, label: string, value: string, threshold: string): Finding {
  return {
    ruleId: `cwv_${metric}`,
    severity: "warning",
    category: "performance",
    targetLocator: `metric:${metric}`,
    evidence: { metric: label, value, threshold },
    title: `${label} below threshold`,
    remediation: `Improve ${label} (measured ${value}, target ≤ ${threshold}).`,
  };
}

export const warningAnalyzers: Analyzer[] = [
  metaDescriptionAnalyzer,
  headingHierarchyAnalyzer,
  structuredDataAnalyzer,
  brokenLinkAnalyzer,
  hreflangAnalyzer,
  coreWebVitalsAnalyzer,
];
