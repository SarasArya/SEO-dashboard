// Shared domain types for the SEO Health Dashboard.

export type PageType = "home" | "plp" | "pdp" | "cart" | "checkout";
export const PAGE_TYPES: PageType[] = ["home", "plp", "pdp", "cart", "checkout"];

export type Severity = "critical" | "warning" | "info";
export const SEVERITIES: Severity[] = ["critical", "warning", "info"];

export type Trigger = "scheduled" | "manual" | "deploy";

export type IssueCategory =
  | "canonical"
  | "indexability"
  | "content"
  | "render"
  | "structured-data"
  | "links"
  | "i18n"
  | "performance"
  | "images"
  | "meta";

// A finding emitted by an analyzer for a single page during a single run.
// This is the structured contract from §4/§6.
export interface Finding {
  ruleId: string;
  severity: Severity;
  category: IssueCategory;
  // Distinguishes e.g. "alt missing on /hero.jpg" from the same rule elsewhere.
  targetLocator: string;
  evidence: Record<string, unknown>;
  remediation: string;
  title: string;
}

// Optional performance metrics (Lighthouse-style) attached to a snapshot.
export interface WebVitals {
  lcpMs?: number;
  inpMs?: number;
  cls?: number;
}

// What an analyzer receives: both the raw (pre-JS) and rendered (post-JS) views.
export interface PageSnapshot {
  url: string;
  pageType: PageType;
  rawHtml: string;
  renderedHtml: string;
  // Rendering metadata, e.g. whether Playwright actually ran.
  rendered: boolean;
  // Region hints so i18n checks know whether hreflang is expected.
  isMultiRegion?: boolean;
  // Core Web Vitals, when a Lighthouse measurement is available (live audits).
  vitals?: WebVitals;
  // Same-origin links found broken by HTTP checks (live audits). When present,
  // the broken-link analyzer uses these instead of the offline href heuristic.
  brokenLinks?: BrokenLink[];
}

export interface BrokenLink {
  url: string;
  status: number; // HTTP status, or 0 for a network/timeout failure
}

// An analyzer inspects a snapshot and emits zero or more findings.
export interface Analyzer {
  id: string;
  run: (snapshot: PageSnapshot) => Finding[];
}

export function isPageType(v: string): v is PageType {
  return (PAGE_TYPES as string[]).includes(v);
}

export function isSeverity(v: string): v is Severity {
  return (SEVERITIES as string[]).includes(v);
}
