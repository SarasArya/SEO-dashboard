import { describe, it, expect } from "vitest";
import { extractVitals } from "@/lib/pipeline/lighthouse";
import { extractSameOriginLinks, isBrokenStatus, classifyStatus } from "@/lib/pipeline/linkcheck";
import { runAnalyzers } from "@/lib/pipeline/analyzers";
import type { PageSnapshot } from "@/lib/types";

describe("lighthouse extractVitals", () => {
  it("maps LCP (ms) and CLS from a Lighthouse result", () => {
    const v = extractVitals({
      audits: {
        "largest-contentful-paint": { numericValue: 4210.7 },
        "cumulative-layout-shift": { numericValue: 0.184 },
      },
    });
    expect(v.lcpMs).toBe(4211);
    expect(v.cls).toBe(0.184);
    // INP is a field metric — never fabricated from a lab run.
    expect(v.inp ?? v.inpMs).toBeUndefined();
  });

  it("omits metrics that are absent", () => {
    expect(extractVitals({ audits: {} })).toEqual({});
    expect(extractVitals({})).toEqual({});
  });
});

describe("linkcheck extractSameOriginLinks", () => {
  const base = "https://shop.example/p/1";
  const html = `
    <a href="/about">rel</a>
    <a href="https://shop.example/contact">abs same-origin</a>
    <a href="https://other.example/x">cross-origin</a>
    <a href="#top">hash</a>
    <a href="mailto:a@b.com">mail</a>
    <a href="javascript:void(0)">js</a>
    <a href="/about">dup</a>
  `;

  it("returns absolute, deduped, same-origin links only", () => {
    const links = extractSameOriginLinks(html, base);
    expect(links).toContain("https://shop.example/about");
    expect(links).toContain("https://shop.example/contact");
    expect(links.some((l) => l.includes("other.example"))).toBe(false);
    expect(links.some((l) => l.includes("#"))).toBe(false);
    expect(links.some((l) => l.startsWith("mailto"))).toBe(false);
    // /about appears twice but dedupes to one.
    expect(links.filter((l) => l.endsWith("/about"))).toHaveLength(1);
  });
});

describe("linkcheck status classification", () => {
  it("flags only genuinely dead links", () => {
    expect(isBrokenStatus(404)).toBe(true);
    expect(isBrokenStatus(410)).toBe(true);
    expect(isBrokenStatus(500)).toBe(true);
    expect(isBrokenStatus(502)).toBe(true);
    expect(isBrokenStatus(0)).toBe(true); // unreachable
  });

  it("does NOT flag rate-limit / anti-bot / transient responses", () => {
    // The goatusa.com 429 false positive that prompted this rule.
    expect(isBrokenStatus(429)).toBe(false);
    expect(isBrokenStatus(403)).toBe(false);
    expect(isBrokenStatus(401)).toBe(false);
    expect(isBrokenStatus(408)).toBe(false);
    expect(isBrokenStatus(503)).toBe(false);
    expect(isBrokenStatus(999)).toBe(false);
    expect(isBrokenStatus(200)).toBe(false);
    expect(isBrokenStatus(301)).toBe(false);
  });

  it("classifies ok / broken / unverified", () => {
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(301)).toBe("ok");
    expect(classifyStatus(404)).toBe("broken");
    expect(classifyStatus(500)).toBe("broken");
    expect(classifyStatus(0)).toBe("broken");
    expect(classifyStatus(429)).toBe("unverified");
    expect(classifyStatus(403)).toBe("unverified");
    expect(classifyStatus(503)).toBe("unverified");
    expect(classifyStatus(999)).toBe("unverified");
  });
});

describe("broken-link analyzer uses live results when present", () => {
  const snap = (overrides: Partial<PageSnapshot>): PageSnapshot => ({
    url: "https://shop.example/p",
    pageType: "pdp",
    rawHtml: "<html><head><title>P</title><link rel=canonical href=/p></head><body><h1>P</h1><span class=price>$1</span></body></html>",
    renderedHtml: "<html><head><title>P</title><link rel=canonical href=/p></head><body><h1>P</h1><span class=price>$1</span></body></html>",
    rendered: true,
    ...overrides,
  });

  it("emits one finding per broken URL from HTTP checks", () => {
    const findings = runAnalyzers(snap({ brokenLinks: [
      { url: "https://shop.example/dead", status: 404 },
      { url: "https://shop.example/down", status: 0 },
    ] }));
    const links = findings.filter((f) => f.ruleId === "broken_internal_link");
    expect(links).toHaveLength(2);
    expect(links.map((f) => f.targetLocator).sort()).toEqual([
      "https://shop.example/dead",
      "https://shop.example/down",
    ]);
  });

  it("emits nothing when brokenLinks is an empty array (live, all healthy)", () => {
    const findings = runAnalyzers(snap({ brokenLinks: [] }));
    expect(findings.some((f) => f.category === "links" && f.ruleId.startsWith("broken"))).toBe(false);
  });

  it("emits info 'could not verify' findings, separate from broken warnings", () => {
    const findings = runAnalyzers(
      snap({
        brokenLinks: [{ url: "https://shop.example/dead", status: 404 }],
        unverifiedLinks: [{ url: "https://shop.example/rl", status: 429 }],
      }),
    );
    const broken = findings.filter((f) => f.ruleId === "broken_internal_link");
    const unverified = findings.filter((f) => f.ruleId === "link_unverified");
    expect(broken).toHaveLength(1);
    expect(broken[0].severity).toBe("warning");
    expect(unverified).toHaveLength(1);
    expect(unverified[0].severity).toBe("info");
    expect(unverified[0].targetLocator).toBe("https://shop.example/rl");
  });
});
