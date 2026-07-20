// Lifecycle diff (§5) — the highest-risk logic in the system.
//
// On each completed run we compare the fingerprints detected this run against
// the fingerprints of issues currently OPEN for this page:
//
//   detected      = { fingerprints found this run }
//   open_existing = { fingerprints of status=open issues for this page }
//
//   NEW      = detected − open_existing   → create issue, first_seen = today
//   STILL    = detected ∩ open_existing   → update last_seen, add occurrence
//   RESOLVED = open_existing − detected   → status=resolved, resolved_date=today
//
// Reopen strategy: NEW row per cycle. A regression (a previously RESOLVED
// fingerprint reappearing) is not in open_existing, so it naturally falls into
// NEW — a fresh row with a fresh first_seen. This keeps every "fixed on X"
// factually true and preserves a clean audit trail. See §2 [DECIDE].
//
// This module is a PURE PLANNER: it takes the detected findings and the open
// issues and returns a plan. Persistence (transactional) lives in the pipeline,
// which keeps this logic trivially unit-testable.

import type { Finding } from "./types";

export interface DetectedFinding {
  fingerprint: string;
  finding: Finding;
}

export interface OpenIssueRef {
  id: string;
  fingerprint: string;
  severity: string;
}

export interface LifecyclePlan {
  // NEW: create a fresh issue row + first occurrence.
  toCreate: DetectedFinding[];
  // STILL open: update last_seen, append an occurrence, maybe update severity.
  toUpdate: Array<{ issue: OpenIssueRef; detected: DetectedFinding }>;
  // RESOLVED: mark resolved with today's run.
  toResolve: OpenIssueRef[];
}

export function diffLifecycle(
  detected: DetectedFinding[],
  openExisting: OpenIssueRef[],
): LifecyclePlan {
  // Dedupe detected by fingerprint (an analyzer set should not emit the same
  // fingerprint twice, but be defensive — first wins).
  const detectedByFp = new Map<string, DetectedFinding>();
  for (const d of detected) {
    if (!detectedByFp.has(d.fingerprint)) detectedByFp.set(d.fingerprint, d);
  }

  const openByFp = new Map<string, OpenIssueRef>();
  for (const o of openExisting) openByFp.set(o.fingerprint, o);

  const toCreate: DetectedFinding[] = [];
  const toUpdate: Array<{ issue: OpenIssueRef; detected: DetectedFinding }> = [];

  for (const [fp, d] of detectedByFp) {
    const open = openByFp.get(fp);
    if (open) {
      toUpdate.push({ issue: open, detected: d });
    } else {
      toCreate.push(d); // NEW (includes regressions of resolved fingerprints)
    }
  }

  const toResolve: OpenIssueRef[] = [];
  for (const [fp, open] of openByFp) {
    if (!detectedByFp.has(fp)) toResolve.push(open); // RESOLVED
  }

  return { toCreate, toUpdate, toResolve };
}
