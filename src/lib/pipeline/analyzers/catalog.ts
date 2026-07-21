// Human-readable catalog of every check the engine runs.
//
// This is the source for the public "Methodology" page. Each entry maps 1:1 to
// an analyzer in the registry (ANALYZERS). A test (tests/catalog.test.ts)
// asserts the catalog and the registry stay in sync, so this page can never
// silently drift from what the code actually checks.

import type { IngestMethod } from "./index";
import type { IssueCategory, PageType, Severity } from "@/lib/types";

export interface RuleDescriptor {
  analyzerId: string;
  title: string;
  severity: Severity; // the severity this check emits (its highest, if it varies)
  category: IssueCategory;
  detects: string; // plain-language description of what it looks for
  remediation: string; // the fix
  method: IngestMethod; // how the signal is obtained
  pageTypes?: PageType[]; // present only for page-type-specific checks
}

export const CATALOG: RuleDescriptor[] = [
  // ---- Critical ----
  {
    analyzerId: "canonical",
    title: "Canonical tag",
    severity: "critical",
    category: "canonical",
    detects: "Exactly one <link rel=\"canonical\"> is present — flags missing or duplicate canonicals.",
    remediation: "Add a single canonical link pointing to the preferred URL.",
    method: "rendered",
  },
  {
    analyzerId: "title_h1",
    title: "Title & H1 present",
    severity: "critical",
    category: "content",
    detects: "The page has a non-empty <title> and at least one <h1>.",
    remediation: "Add a unique <title> (<60 chars) and one descriptive <h1>.",
    method: "rendered",
  },
  {
    analyzerId: "indexability",
    title: "Indexability (page-type aware)",
    severity: "critical",
    category: "indexability",
    detects:
      "Indexable pages must not carry noindex; cart & checkout must (the expectation flips by page type).",
    remediation: "Remove noindex from indexable pages; add it to cart/checkout.",
    method: "rendered",
    pageTypes: ["home", "plp", "pdp", "cart", "checkout"],
  },
  {
    analyzerId: "render_gap",
    title: "Render gap (raw vs. rendered)",
    severity: "critical",
    category: "render",
    detects:
      "Key content (title, H1, and price on PDPs) present in the post-JS DOM but absent from the raw HTML — crawlers that don't execute JS won't see it.",
    remediation: "Server-render or pre-render the missing content.",
    method: "raw-vs-rendered",
    pageTypes: ["pdp"],
  },
  // ---- Warning ----
  {
    analyzerId: "meta_description",
    title: "Meta description",
    severity: "warning",
    category: "meta",
    detects: "A meta description exists and is 70–160 characters.",
    remediation: "Write a concise, unique meta description in range.",
    method: "rendered",
  },
  {
    analyzerId: "heading_hierarchy",
    title: "Heading hierarchy",
    severity: "warning",
    category: "content",
    detects: "A single H1 and no skipped heading levels (e.g. H2 → H4).",
    remediation: "Use one H1 and keep the heading outline sequential.",
    method: "rendered",
  },
  {
    analyzerId: "structured_data",
    title: "Structured data",
    severity: "warning",
    category: "structured-data",
    detects: "JSON-LD parses, and PDPs include Product structured data.",
    remediation: "Fix invalid JSON-LD; add Product schema to PDPs.",
    method: "rendered",
    pageTypes: ["pdp"],
  },
  {
    analyzerId: "broken_links",
    title: "Broken internal links",
    severity: "warning",
    category: "links",
    detects:
      "Live audits politely HTTP-check same-origin links and flag only genuinely dead ones (404/410, server errors, unreachable) as warnings. Inconclusive responses (rate-limit / anti-bot / auth: 429/403/503) are surfaced separately as an info \"could not verify\" note, never as broken. Offline, flags empty, \"#\", or javascript: hrefs.",
    remediation: "Point links at reachable URLs; remove dead links.",
    method: "http",
  },
  {
    analyzerId: "hreflang",
    title: "hreflang (multi-region)",
    severity: "warning",
    category: "i18n",
    detects: "Multi-region sites declare hreflang alternate links.",
    remediation: "Add rel=alternate hreflang tags for each region.",
    method: "rendered",
  },
  {
    analyzerId: "core_web_vitals",
    title: "Core Web Vitals",
    severity: "warning",
    category: "performance",
    detects:
      "LCP ≤ 2500ms and CLS ≤ 0.1 (measured by Lighthouse on live audits). INP requires field data (CrUX).",
    remediation: "Optimize LCP element and layout stability.",
    method: "metrics",
  },
  // ---- Info ----
  {
    analyzerId: "image_alt",
    title: "Image alt text",
    severity: "info",
    category: "images",
    detects: "Every <img> has non-empty alt text (one finding per image).",
    remediation: "Add descriptive alt text to each image.",
    method: "rendered",
  },
  {
    analyzerId: "link_text",
    title: "Descriptive link text",
    severity: "info",
    category: "links",
    detects: "Links avoid non-descriptive text like \"click here\" or \"read more\".",
    remediation: "Use link text that describes the destination.",
    method: "rendered",
  },
  {
    analyzerId: "image_optimization",
    title: "Image optimization",
    severity: "info",
    category: "images",
    detects: "Images use modern formats (WebP/AVIF) and declare width/height.",
    remediation: "Serve next-gen formats and set explicit dimensions.",
    method: "rendered",
  },
];
