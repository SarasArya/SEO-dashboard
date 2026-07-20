// Deterministic scoring (Locked Decision #5).
//
// The 0-100 score is a pure function of the *open* issues' severities:
//   start at 100, subtract config-weighted penalties, clamp to [0, 100].
// A score drop always has an explainable cause in the issues below it, and the
// same issue set always yields the same score (unit-tested).

import { penaltyFor, PAGE_TYPE_WEIGHTS } from "./config";
import type { Severity } from "./types";

export interface ScorableIssue {
  severity: Severity;
  status: "open" | "resolved";
}

// Score for a single page = 100 − Σ penalties over OPEN issues.
export function scorePage(issues: ScorableIssue[]): number {
  const penalty = issues
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + penaltyFor(i.severity), 0);
  return clampScore(100 - penalty);
}

// Breakdown so the UI can explain a score ("−45 from 3 critical, −10 from 2 warning").
export interface ScoreBreakdown {
  score: number;
  penalty: number;
  countsBySeverity: Record<Severity, number>;
  penaltyBySeverity: Record<Severity, number>;
}

export function scorePageWithBreakdown(issues: ScorableIssue[]): ScoreBreakdown {
  const open = issues.filter((i) => i.status === "open");
  const countsBySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  const penaltyBySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const i of open) {
    countsBySeverity[i.severity] += 1;
    penaltyBySeverity[i.severity] += penaltyFor(i.severity);
  }
  const penalty = penaltyBySeverity.critical + penaltyBySeverity.warning + penaltyBySeverity.info;
  return { score: clampScore(100 - penalty), penalty, countsBySeverity, penaltyBySeverity };
}

// Aggregate ("All" filter) = config-weighted mean of per-page scores.
// Deterministic and rounded consistently.
export function aggregateScore(
  pageScores: Array<{ pageType: string; score: number }>,
): number {
  if (pageScores.length === 0) return 100;
  let weighted = 0;
  let weightSum = 0;
  for (const p of pageScores) {
    const w = PAGE_TYPE_WEIGHTS[p.pageType] ?? 1;
    weighted += p.score * w;
    weightSum += w;
  }
  return clampScore(Math.round(weighted / weightSum));
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
