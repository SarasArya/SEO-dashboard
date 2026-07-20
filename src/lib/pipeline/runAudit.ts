// Audit pipeline orchestrator (§4/§8).
//
//   Fetcher (raw pre-JS HTML)
//     → Renderer (Playwright, post-JS DOM)
//     → Analyzers (independent rule checks)
//     → Scorer + Issue Classifier
//     → Lifecycle Diff (resolve / new / still-open)
//     → persist (run, occurrences, page_scores)  [one transaction]
//
// Persistence is transactional so the "at most one OPEN issue per fingerprint"
// invariant holds even under concurrent runs.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { Finding, PageSnapshot, PageType, Trigger } from "@/lib/types";
import { fingerprint } from "@/lib/fingerprint";
import { diffLifecycle, type DetectedFinding, type OpenIssueRef } from "@/lib/lifecycle";
import { scorePage } from "@/lib/scoring";
import { runAnalyzers } from "./analyzers";
import { fetchRaw } from "./fetcher";
import { renderDom } from "./renderer";

export interface AuditablePage {
  id: string;
  projectId: string;
  pageType: PageType;
  url: string;
  isMultiRegion?: boolean;
}

// Fetch + render a live page into a snapshot.
export async function buildSnapshot(page: AuditablePage): Promise<PageSnapshot> {
  const raw = await fetchRaw(page.url);
  const rendered = await renderDom(page.url);
  return {
    url: page.url,
    pageType: page.pageType,
    rawHtml: raw.rawHtml,
    renderedHtml: rendered.rendered ? rendered.renderedHtml : raw.rawHtml,
    rendered: rendered.rendered,
    isMultiRegion: page.isMultiRegion,
  };
}

export interface AuditResult {
  runId: string;
  score: number;
  detected: number;
  created: number;
  stillOpen: number;
  resolved: number;
}

// Run analyzers on a snapshot and persist everything for one page/run.
export async function persistAudit(
  page: AuditablePage,
  snapshot: PageSnapshot,
  opts: { trigger: Trigger; runDate: Date; findings?: Finding[]; prisma?: PrismaClient },
): Promise<AuditResult> {
  const db = opts.prisma ?? defaultPrisma;
  const findings = opts.findings ?? runAnalyzers(snapshot);

  const detected: DetectedFinding[] = findings.map((f) => ({
    fingerprint: fingerprint({
      projectId: page.projectId,
      pageType: page.pageType,
      ruleId: f.ruleId,
      targetLocator: f.targetLocator,
    }),
    finding: f,
  }));

  // The score reflects exactly the issues open as of this run — i.e. everything
  // detected this run. This keeps graph and issue list mathematically consistent.
  const score = scorePage(findings.map((f) => ({ severity: f.severity, status: "open" })));

  return db.$transaction(async (tx) => {
    const run = await tx.run.create({
      data: {
        projectId: page.projectId,
        pageId: page.id,
        runDate: opts.runDate,
        trigger: opts.trigger,
        status: "completed",
        rawHtmlRef: hashRef(snapshot.rawHtml),
        renderedDomRef: snapshot.rendered ? hashRef(snapshot.renderedHtml) : null,
      },
    });

    const openIssues = await tx.issue.findMany({
      where: { pageId: page.id, status: "open" },
      select: { id: true, fingerprint: true, severity: true },
    });
    const open: OpenIssueRef[] = openIssues.map((i) => ({
      id: i.id,
      fingerprint: i.fingerprint,
      severity: i.severity,
    }));

    const plan = diffLifecycle(detected, open);

    // NEW → create issue row + first occurrence.
    for (const d of plan.toCreate) {
      const issue = await tx.issue.create({
        data: {
          projectId: page.projectId,
          pageId: page.id,
          fingerprint: d.fingerprint,
          ruleId: d.finding.ruleId,
          category: d.finding.category,
          severity: d.finding.severity,
          status: "open",
          firstSeenRunId: run.id,
          firstSeenDate: opts.runDate,
          lastSeenRunId: run.id,
          lastSeenDate: opts.runDate,
          title: d.finding.title,
          remediation: d.finding.remediation,
        },
      });
      await tx.issueOccurrence.create({
        data: {
          issueId: issue.id,
          projectId: page.projectId,
          runId: run.id,
          runDate: opts.runDate,
          severityAtRun: d.finding.severity,
          evidence: JSON.stringify(d.finding.evidence),
        },
      });
    }

    // STILL → bump last_seen, refresh current severity, append occurrence.
    for (const u of plan.toUpdate) {
      await tx.issue.update({
        where: { id: u.issue.id },
        data: {
          lastSeenRunId: run.id,
          lastSeenDate: opts.runDate,
          severity: u.detected.finding.severity,
          category: u.detected.finding.category,
          title: u.detected.finding.title,
          remediation: u.detected.finding.remediation,
        },
      });
      await tx.issueOccurrence.create({
        data: {
          issueId: u.issue.id,
          projectId: page.projectId,
          runId: run.id,
          runDate: opts.runDate,
          severityAtRun: u.detected.finding.severity,
          evidence: JSON.stringify(u.detected.finding.evidence),
        },
      });
    }

    // RESOLVED → close with this run's date.
    for (const r of plan.toResolve) {
      await tx.issue.update({
        where: { id: r.id },
        data: { status: "resolved", resolvedRunId: run.id, resolvedDate: opts.runDate },
      });
    }

    // Persist the thin time-series row that powers the graph.
    await tx.pageScore.create({
      data: {
        runId: run.id,
        projectId: page.projectId,
        pageId: page.id,
        pageType: page.pageType,
        runDate: opts.runDate,
        score,
      },
    });

    return {
      runId: run.id,
      score,
      detected: detected.length,
      created: plan.toCreate.length,
      stillOpen: plan.toUpdate.length,
      resolved: plan.toResolve.length,
    };
  });
}

// Full live audit: fetch + render + analyze + persist.
export async function runLiveAudit(
  page: AuditablePage,
  opts: { trigger: Trigger; runDate?: Date; prisma?: PrismaClient },
): Promise<AuditResult> {
  const snapshot = await buildSnapshot(page);
  return persistAudit(page, snapshot, {
    trigger: opts.trigger,
    runDate: opts.runDate ?? new Date(),
    prisma: opts.prisma,
  });
}

function hashRef(content: string): string {
  // Cheap content pointer. In production this would be an object-store key.
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) | 0;
  return `sha:${(h >>> 0).toString(16)}:${content.length}`;
}
