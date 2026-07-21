// Config-driven weights and rule metadata (§5/§6 of the brief).
//
// "Severity and score weights live in config so they can evolve without code
// changes." Keeping this in one module means the scorer, analyzers, and any
// future admin UI share a single source of truth.

import type { Severity } from "./types";

// Score = 100 − Σ (penalty per open issue by severity). Critical >> warning >> info.
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 15,
  warning: 5,
  info: 1,
};

// Aggregate ("All" filter) across active pages uses a weighted mean. Page types
// closer to conversion are weighted a little higher, but weights are uniform by
// default; tweak here without touching query code.
export const PAGE_TYPE_WEIGHTS: Record<string, number> = {
  home: 1,
  plp: 1,
  pdp: 1,
  cart: 1,
  checkout: 1,
};

// Default window for the trend graph / sparkline / deltas.
export const TREND_WINDOW_DAYS = 90;

// Core Web Vitals thresholds used by the performance analyzer (Lighthouse-style).
export const CWV_THRESHOLDS = {
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
};

export function penaltyFor(severity: Severity): number {
  return SEVERITY_WEIGHTS[severity];
}

// The daily scheduled-audit cadence. Must match the cron in vercel.json
// ("0 3 * * *"). Used to show "next run at" on project cards.
export const SCHEDULED_HOUR_UTC = 3;

export function nextScheduledRun(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(SCHEDULED_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// Whether audits crawl real URLs (Playwright + Lighthouse + HTTP link checks)
// or use the deterministic synthetic snapshot source. Surfaced in the UI so a
// synthetic run is never mistaken for a real crawl.
export type AuditMode = "live" | "synthetic";

export function auditMode(): AuditMode {
  return process.env.LIVE_AUDITS === "1" ? "live" : "synthetic";
}

// Default page paths scaffolded for a new project (one per page type).
export const DEFAULT_PAGE_PATHS: Record<string, string> = {
  home: "/",
  plp: "/collections/all",
  pdp: "/products/flagship-product",
  cart: "/cart",
  checkout: "/checkout",
};
