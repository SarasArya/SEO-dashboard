import { describe, it, expect } from "vitest";
import {
  scorePage,
  scorePageWithBreakdown,
  aggregateScore,
  clampScore,
} from "@/lib/scoring";
import { SEVERITY_WEIGHTS } from "@/lib/config";
import type { ScorableIssue } from "@/lib/scoring";

const open = (severity: ScorableIssue["severity"]): ScorableIssue => ({ severity, status: "open" });
const resolved = (severity: ScorableIssue["severity"]): ScorableIssue => ({ severity, status: "resolved" });

describe("deterministic scoring", () => {
  it("a clean page scores 100", () => {
    expect(scorePage([])).toBe(100);
  });

  it("subtracts config-weighted penalties for open issues only", () => {
    const issues = [open("critical"), open("warning"), open("info")];
    const expected = 100 - (SEVERITY_WEIGHTS.critical + SEVERITY_WEIGHTS.warning + SEVERITY_WEIGHTS.info);
    expect(scorePage(issues)).toBe(expected);
  });

  it("ignores resolved issues", () => {
    expect(scorePage([resolved("critical"), resolved("critical")])).toBe(100);
    expect(scorePage([open("critical"), resolved("critical")])).toBe(100 - SEVERITY_WEIGHTS.critical);
  });

  it("clamps to 0 when penalties exceed 100", () => {
    const manyCriticals = Array.from({ length: 20 }, () => open("critical"));
    expect(scorePage(manyCriticals)).toBe(0);
  });

  it("is deterministic — same input, same output, order-independent", () => {
    const a = [open("critical"), open("info"), open("warning")];
    const b = [open("info"), open("warning"), open("critical")];
    expect(scorePage(a)).toBe(scorePage(b));
    expect(scorePage(a)).toBe(scorePage(a));
  });

  it("breakdown explains the score", () => {
    const bd = scorePageWithBreakdown([open("critical"), open("critical"), open("warning")]);
    expect(bd.countsBySeverity.critical).toBe(2);
    expect(bd.countsBySeverity.warning).toBe(1);
    expect(bd.penaltyBySeverity.critical).toBe(2 * SEVERITY_WEIGHTS.critical);
    expect(bd.score).toBe(100 - bd.penalty);
    // A score drop is always explainable by the penalty breakdown.
    const totalPenalty =
      bd.penaltyBySeverity.critical + bd.penaltyBySeverity.warning + bd.penaltyBySeverity.info;
    expect(bd.penalty).toBe(totalPenalty);
  });

  it("aggregate is a weighted mean across pages", () => {
    expect(aggregateScore([{ pageType: "pdp", score: 80 }, { pageType: "home", score: 100 }])).toBe(90);
  });

  it("aggregate of no pages is 100", () => {
    expect(aggregateScore([])).toBe(100);
  });

  it("clampScore rounds and bounds", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(78.4)).toBe(78);
    expect(clampScore(78.6)).toBe(79);
  });
});
