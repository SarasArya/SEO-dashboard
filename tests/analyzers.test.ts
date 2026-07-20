import { describe, it, expect } from "vitest";
import { runAnalyzers } from "@/lib/pipeline/analyzers";
import type { PageSnapshot, PageType } from "@/lib/types";

function snap(overrides: Partial<PageSnapshot> & { rawHtml: string; renderedHtml?: string }): PageSnapshot {
  return {
    url: "https://shop.example/x",
    pageType: (overrides.pageType ?? "pdp") as PageType,
    rawHtml: overrides.rawHtml,
    renderedHtml: overrides.renderedHtml ?? overrides.rawHtml,
    rendered: overrides.rendered ?? true,
    isMultiRegion: overrides.isMultiRegion,
    vitals: overrides.vitals,
  };
}

const CLEAN_PDP = `<!doctype html><html><head>
  <title>Great Product — Buy Now Online Today</title>
  <link rel="canonical" href="https://shop.example/p/1">
  <meta name="description" content="This is a nicely sized meta description that comfortably sits within the recommended range for search engine result snippets.">
  <script type="application/ld+json">{"@type":"Product","name":"Great Product","offers":{"@type":"Offer","price":"19.99"}}</script>
</head><body>
  <h1>Great Product</h1>
  <span class="price">$19.99</span>
  <img src="/hero.webp" alt="Great product" width="800" height="600">
  <a href="/related">See related products</a>
</body></html>`;

describe("analyzers", () => {
  it("a clean PDP produces no findings", () => {
    const findings = runAnalyzers(snap({ rawHtml: CLEAN_PDP, pageType: "pdp" }));
    expect(findings).toEqual([]);
  });

  it("flags missing canonical, title, and h1 as critical", () => {
    const findings = runAnalyzers(snap({ rawHtml: "<html><head></head><body><p>x</p></body></html>", pageType: "home" }));
    const rules = findings.map((f) => f.ruleId);
    expect(rules).toContain("missing_canonical");
    expect(rules).toContain("missing_title");
    expect(rules).toContain("missing_h1");
    expect(findings.filter((f) => f.severity === "critical").length).toBeGreaterThanOrEqual(3);
  });

  it("detects a render gap: price only in rendered DOM on a PDP", () => {
    const raw = `<html><head><title>P</title><link rel=canonical href=/p></head><body><h1>P</h1></body></html>`;
    const rendered = `<html><head><title>P</title><link rel=canonical href=/p></head><body><h1>P</h1><span class="price">$9</span></body></html>`;
    const findings = runAnalyzers(snap({ rawHtml: raw, renderedHtml: rendered, pageType: "pdp", rendered: true }));
    expect(findings.map((f) => f.ruleId)).toContain("render_gap_price");
  });

  it("flips indexability expectation for checkout (should be noindex)", () => {
    const html = `<html><head><title>Checkout</title><link rel=canonical href=/c></head><body><h1>Checkout</h1></body></html>`;
    const findings = runAnalyzers(snap({ rawHtml: html, pageType: "checkout" }));
    expect(findings.map((f) => f.ruleId)).toContain("should_be_noindex");
  });

  it("accepts a noindex checkout page", () => {
    const html = `<html><head><title>Checkout</title><meta name="robots" content="noindex"><link rel=canonical href=/c></head><body><h1>Checkout</h1></body></html>`;
    const findings = runAnalyzers(snap({ rawHtml: html, pageType: "checkout" }));
    expect(findings.map((f) => f.ruleId)).not.toContain("should_be_noindex");
  });

  it("emits per-image alt findings with distinct locators", () => {
    const html = `<html><head><title>P</title><link rel=canonical href=/p></head><body><h1>P</h1>
      <img src="/a.webp" width=10 height=10><img src="/b.webp" width=10 height=10></body></html>`;
    const findings = runAnalyzers(snap({ rawHtml: html, pageType: "home" }));
    const alt = findings.filter((f) => f.ruleId === "img_alt_missing");
    expect(alt).toHaveLength(2);
    expect(new Set(alt.map((f) => f.targetLocator))).toEqual(new Set(["/a.webp", "/b.webp"]));
  });

  it("flags Core Web Vitals over threshold when metrics are present", () => {
    const findings = runAnalyzers(snap({ rawHtml: CLEAN_PDP, pageType: "pdp", vitals: { lcpMs: 4200, inpMs: 50, cls: 0.02 } }));
    expect(findings.map((f) => f.ruleId)).toContain("cwv_lcp");
    expect(findings.map((f) => f.ruleId)).not.toContain("cwv_inp");
  });
});
