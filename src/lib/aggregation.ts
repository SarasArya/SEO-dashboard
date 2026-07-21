// BFF aggregation (§7). All aggregation lives here so the frontend stays thin —
// route handlers are near-passthroughs over these functions.

import { prisma } from "./db";
import { aggregateScore } from "./scoring";
import { TREND_WINDOW_DAYS, nextScheduledRun } from "./config";
import { PAGE_TYPES, type PageType, type Severity } from "./types";

export interface ProjectCard {
  id: string;
  name: string;
  domain: string;
  current_score: number;
  score_delta_90d: number;
  critical_open_count: number;
  last_run_at: string | null;
  next_run_at: string;
  sparkline: Array<{ run_date: string; score: number }>;
}

export interface ScorePoint {
  run_date: string;
  score: number;
}

export interface IssueListItem {
  id: string;
  rule_id: string;
  category: string;
  severity: Severity;
  status: string;
  title: string;
  remediation: string;
  first_seen_date: string;
  last_seen_date: string;
  resolved_date: string | null;
  occurrence_count: number;
  latest_evidence: unknown;
}

export interface IssuesResponse {
  page_type: string;
  status: string;
  as_of: string | null;
  counts: Record<Severity, number>;
  groups: Record<Severity, IssueListItem[]>;
}

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function windowStart(days = TREND_WINDOW_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---- Screen A: project cards -------------------------------------------------

export async function getProjectCards(): Promise<ProjectCard[]> {
  const projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  const from = windowStart();

  const cards = await Promise.all(
    projects.map(async (p): Promise<ProjectCard> => {
      const series = await getScoreSeries(p.id, "all", from, new Date());
      const current = series.length ? series[series.length - 1].score : 100;
      const first = series.length ? series[0].score : current;

      const criticalOpen = await prisma.issue.count({
        where: { projectId: p.id, status: "open", severity: "critical" },
      });
      const lastRun = await prisma.run.findFirst({
        where: { projectId: p.id },
        orderBy: { runDate: "desc" },
        select: { runDate: true },
      });

      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        current_score: current,
        score_delta_90d: current - first,
        critical_open_count: criticalOpen,
        last_run_at: lastRun ? lastRun.runDate.toISOString() : null,
        next_run_at: nextScheduledRun(new Date()).toISOString(),
        sparkline: series,
      };
    }),
  );
  return cards;
}

// ---- Screen B: score series (graph) -----------------------------------------
// page_type "all" => config-weighted mean across active pages per day.
export async function getScoreSeries(
  projectId: string,
  pageType: PageType | "all",
  from?: Date,
  to?: Date,
): Promise<ScorePoint[]> {
  const where: Record<string, unknown> = { projectId };
  if (pageType !== "all") where.pageType = pageType;
  if (from || to) {
    where.runDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const rows = await prisma.pageScore.findMany({
    where,
    orderBy: { runDate: "asc" },
    select: { runDate: true, score: true, pageType: true },
  });

  // Bucket by calendar day, then aggregate within the day.
  const byDay = new Map<string, Array<{ pageType: string; score: number }>>();
  for (const r of rows) {
    const key = r.runDate.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ pageType: r.pageType, score: r.score });
  }

  const points: ScorePoint[] = [];
  for (const [day, entries] of [...byDay.entries()].sort()) {
    const score = pageType === "all" ? aggregateScore(entries) : aggregateScore(entries);
    points.push({ run_date: day, score });
  }
  return points;
}

// ---- Screen B: issues (with time-travel via as_of) ---------------------------
export async function getIssues(
  projectId: string,
  pageType: PageType | "all",
  status: "open" | "resolved" | "all",
  asOf?: Date,
): Promise<IssuesResponse> {
  const groups: Record<Severity, IssueListItem[]> = { critical: [], warning: [], info: [] };

  if (asOf) {
    // Time-travel: read issue_occurrences at that run date rather than current
    // state. This is what makes clicking a graph point load that day's snapshot.
    const { start, end } = dayBounds(asOf);
    const runWhere: Record<string, unknown> = { projectId, runDate: { gte: start, lte: end } };
    const runs = await prisma.run.findMany({
      where: runWhere,
      select: { id: true, page: { select: { pageType: true } } },
    });
    const runIds = runs
      .filter((r) => pageType === "all" || r.page.pageType === pageType)
      .map((r) => r.id);

    const occurrences = await prisma.issueOccurrence.findMany({
      where: { runId: { in: runIds } },
      include: {
        issue: {
          include: { _count: { select: { occurrences: true } } },
        },
      },
    });

    for (const occ of occurrences) {
      const sev = occ.severityAtRun as Severity;
      groups[sev]?.push({
        id: occ.issue.id,
        rule_id: occ.issue.ruleId,
        category: occ.issue.category,
        severity: sev,
        status: occ.issue.status,
        title: occ.issue.title,
        remediation: occ.issue.remediation,
        first_seen_date: occ.issue.firstSeenDate.toISOString(),
        last_seen_date: occ.issue.lastSeenDate.toISOString(),
        resolved_date: occ.issue.resolvedDate ? occ.issue.resolvedDate.toISOString() : null,
        occurrence_count: occ.issue._count.occurrences,
        latest_evidence: safeParse(occ.evidence),
      });
    }
  } else {
    // Current state.
    const where: Record<string, unknown> = { projectId };
    if (status !== "all") where.status = status;
    if (pageType !== "all") where.page = { pageType };

    const issues = await prisma.issue.findMany({
      where,
      include: {
        _count: { select: { occurrences: true } },
        occurrences: { orderBy: { runDate: "desc" }, take: 1 },
      },
      orderBy: { firstSeenDate: "asc" },
    });

    for (const i of issues) {
      const sev = i.severity as Severity;
      groups[sev]?.push({
        id: i.id,
        rule_id: i.ruleId,
        category: i.category,
        severity: sev,
        status: i.status,
        title: i.title,
        remediation: i.remediation,
        first_seen_date: i.firstSeenDate.toISOString(),
        last_seen_date: i.lastSeenDate.toISOString(),
        resolved_date: i.resolvedDate ? i.resolvedDate.toISOString() : null,
        occurrence_count: i._count.occurrences,
        latest_evidence: i.occurrences[0] ? safeParse(i.occurrences[0].evidence) : null,
      });
    }
  }

  const counts: Record<Severity, number> = {
    critical: groups.critical.length,
    warning: groups.warning.length,
    info: groups.info.length,
  };
  return {
    page_type: pageType,
    status,
    as_of: asOf ? asOf.toISOString() : null,
    counts,
    groups: reorder(groups),
  };
}

function reorder(groups: Record<Severity, IssueListItem[]>): Record<Severity, IssueListItem[]> {
  const out = {} as Record<Severity, IssueListItem[]>;
  for (const s of SEVERITY_ORDER) out[s] = groups[s];
  return out;
}

// ---- Issue drill-down: full lifecycle + occurrence timeline ------------------
export async function getIssueDetail(issueId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      page: { select: { pageType: true, url: true } },
      project: { select: { name: true, domain: true } },
      occurrences: {
        orderBy: { runDate: "asc" },
        include: { run: { select: { trigger: true } } },
      },
    },
  });
  if (!issue) return null;

  return {
    id: issue.id,
    rule_id: issue.ruleId,
    category: issue.category,
    severity: issue.severity,
    status: issue.status,
    title: issue.title,
    remediation: issue.remediation,
    fingerprint: issue.fingerprint,
    page_type: issue.page.pageType,
    url: issue.page.url,
    project: issue.project,
    first_seen_date: issue.firstSeenDate.toISOString(),
    last_seen_date: issue.lastSeenDate.toISOString(),
    resolved_date: issue.resolvedDate ? issue.resolvedDate.toISOString() : null,
    occurrence_count: issue.occurrences.length,
    // Every run this issue appeared in, with evidence for that run.
    timeline: issue.occurrences.map((o) => ({
      run_date: o.runDate.toISOString(),
      severity_at_run: o.severityAtRun,
      trigger: o.run.trigger,
      evidence: safeParse(o.evidence),
    })),
  };
}

export async function getProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: { pages: { where: { isActive: true }, select: { pageType: true, url: true } } },
  });
}

export function availablePageTypes(): PageType[] {
  return PAGE_TYPES;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
