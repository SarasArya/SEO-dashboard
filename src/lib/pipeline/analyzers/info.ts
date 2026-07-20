// Info analyzers (§6).
import type { Analyzer, Finding, PageSnapshot } from "@/lib/types";
import { parse, pathOf } from "./dom";

const NON_DESCRIPTIVE = new Set(["click here", "here", "read more", "more", "link", "this"]);
const MODERN_FORMATS = new Set([".webp", ".avif", ".svg"]);

// Image alt text missing — one finding per image, locator = image src path.
export const imageAltAnalyzer: Analyzer = {
  id: "image_alt",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const findings: Finding[] = [];
    $("img").each((_, el) => {
      const alt = $(el).attr("alt");
      const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
      if (!src) return;
      if (alt == null || alt.trim() === "") {
        const loc = pathOf(src);
        findings.push({
          ruleId: "img_alt_missing",
          severity: "info",
          category: "images",
          targetLocator: loc,
          evidence: { src: loc, alt: alt ?? null },
          title: "Image alt text missing",
          remediation: `Add descriptive alt text to the image at ${loc}.`,
        });
      }
    });
    return findings;
  },
};

// Non-descriptive link text.
export const linkTextAnalyzer: Analyzer = {
  id: "link_text",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const seen = new Set<string>();
    const findings: Finding[] = [];
    $("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const href = ($(el).attr("href") ?? "").trim();
      if (!text || !href) return;
      if (NON_DESCRIPTIVE.has(text)) {
        const loc = `${pathOf(href)}::${text}`;
        if (seen.has(loc)) return;
        seen.add(loc);
        findings.push({
          ruleId: "non_descriptive_link_text",
          severity: "info",
          category: "links",
          targetLocator: loc,
          evidence: { text, href: pathOf(href) },
          title: "Non-descriptive link text",
          remediation: `Replace "${text}" with text that describes the destination.`,
        });
      }
    });
    return findings;
  },
};

// Image size / format not optimized: legacy formats or images missing explicit
// dimensions (which harms CLS).
export const imageOptimizationAnalyzer: Analyzer = {
  id: "image_optimization",
  run(snapshot: PageSnapshot): Finding[] {
    const $ = parse(snapshot.renderedHtml || snapshot.rawHtml);
    const findings: Finding[] = [];
    $("img").each((_, el) => {
      const src = ($(el).attr("src") ?? $(el).attr("data-src") ?? "").toLowerCase();
      if (!src) return;
      const ext = src.slice(src.lastIndexOf(".")).split("?")[0];
      const isLegacy = ext === ".jpg" || ext === ".jpeg" || ext === ".png";
      const missingDims = $(el).attr("width") == null || $(el).attr("height") == null;
      if (isLegacy || missingDims) {
        const loc = pathOf(src);
        findings.push({
          ruleId: "image_not_optimized",
          severity: "info",
          category: "images",
          targetLocator: loc,
          evidence: {
            src: loc,
            format: ext,
            modernFormat: MODERN_FORMATS.has(ext),
            hasExplicitDimensions: !missingDims,
          },
          title: "Image not optimized",
          remediation: "Serve WebP/AVIF and set explicit width/height to avoid layout shift.",
        });
      }
    });
    return findings;
  },
};

export const infoAnalyzers: Analyzer[] = [
  imageAltAnalyzer,
  linkTextAnalyzer,
  imageOptimizationAnalyzer,
];
