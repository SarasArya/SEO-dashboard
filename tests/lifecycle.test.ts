import { describe, it, expect } from "vitest";
import { diffLifecycle, type DetectedFinding, type OpenIssueRef } from "@/lib/lifecycle";
import { fingerprint } from "@/lib/fingerprint";
import type { Finding, PageType } from "@/lib/types";

const PROJECT = "proj_1";
const PAGE: PageType = "pdp";

function fp(ruleId: string, locator: string): string {
  return fingerprint({ projectId: PROJECT, pageType: PAGE, ruleId, targetLocator: locator });
}

function finding(ruleId: string, locator: string, severity: Finding["severity"] = "critical"): Finding {
  return {
    ruleId,
    severity,
    category: "content",
    targetLocator: locator,
    evidence: { note: `${ruleId}@${locator}` },
    remediation: "fix it",
    title: `${ruleId} problem`,
  };
}

function detected(ruleId: string, locator: string, severity?: Finding["severity"]): DetectedFinding {
  return { fingerprint: fp(ruleId, locator), finding: finding(ruleId, locator, severity) };
}

function openIssue(ruleId: string, locator: string, severity = "critical"): OpenIssueRef {
  return { id: `issue_${ruleId}_${locator}`, fingerprint: fp(ruleId, locator), severity };
}

describe("lifecycle diff", () => {
  it("creates NEW issues for fingerprints not currently open", () => {
    const plan = diffLifecycle([detected("missing_h1", "body")], []);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
    expect(plan.toCreate[0].fingerprint).toBe(fp("missing_h1", "body"));
  });

  it("marks STILL-open issues for fingerprints found again", () => {
    const open = [openIssue("missing_h1", "body")];
    const plan = diffLifecycle([detected("missing_h1", "body")], open);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].issue.id).toBe("issue_missing_h1_body");
  });

  it("RESOLVES open issues no longer detected", () => {
    const open = [openIssue("missing_h1", "body")];
    const plan = diffLifecycle([], open);
    expect(plan.toResolve).toHaveLength(1);
    expect(plan.toResolve[0].id).toBe("issue_missing_h1_body");
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("handles a mixed run: one new, one still, one resolved", () => {
    const open = [openIssue("missing_h1", "body"), openIssue("missing_canonical", "head")];
    const detectedNow = [
      detected("missing_h1", "body"), // STILL
      detected("render_gap", "price"), // NEW
      // missing_canonical no longer present -> RESOLVED
    ];
    const plan = diffLifecycle(detectedNow, open);
    expect(plan.toCreate.map((d) => d.finding.ruleId)).toEqual(["render_gap"]);
    expect(plan.toUpdate.map((u) => u.issue.id)).toEqual(["issue_missing_h1_body"]);
    expect(plan.toResolve.map((r) => r.id)).toEqual(["issue_missing_canonical_head"]);
  });

  it("treats a regression (resolved fingerprint reappearing) as NEW — new row per cycle", () => {
    // The resolved issue is NOT in open_existing, so its fingerprint reappearing
    // must produce a brand new issue row, not an update.
    const open: OpenIssueRef[] = [];
    const plan = diffLifecycle([detected("missing_h1", "body")], open);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("distinguishes the same rule at different locators", () => {
    const open = [openIssue("img_alt_missing", "/hero.jpg")];
    const detectedNow = [
      detected("img_alt_missing", "/hero.jpg"), // STILL
      detected("img_alt_missing", "/banner.jpg"), // NEW (different locator)
    ];
    const plan = diffLifecycle(detectedNow, open);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].finding.targetLocator).toBe("/banner.jpg");
  });

  it("dedupes duplicate detected fingerprints (first wins)", () => {
    const plan = diffLifecycle(
      [detected("missing_h1", "body", "critical"), detected("missing_h1", "body", "warning")],
      [],
    );
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].finding.severity).toBe("critical");
  });

  it("empty run with no open issues is a no-op", () => {
    const plan = diffLifecycle([], []);
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
  });
});
