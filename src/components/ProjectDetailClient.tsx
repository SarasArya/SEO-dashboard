"use client";
import { useCallback, useEffect, useState } from "react";
import { TrendChart, type ScorePoint } from "./TrendChart";
import { IssueGroups } from "./Issues";
import { deltaClass, deltaLabel, formatDate, relativeTime } from "@/lib/format";
import { PAGE_TYPES, type PageType, type Severity } from "@/lib/types";
import type { IssueListItem } from "@/lib/aggregation";

type Filter = PageType | "all";
type StatusFilter = "open" | "resolved" | "all";

interface Props {
  projectId: string;
  name: string;
  domain: string;
  lastRunAt: string | null;
}

interface IssuesResponse {
  counts: Record<Severity, number>;
  groups: Record<Severity, IssueListItem[]>;
}

const FILTERS: Filter[] = ["all", ...PAGE_TYPES];

export function ProjectDetailClient({ projectId, name, domain, lastRunAt }: Props) {
  const [pageType, setPageType] = useState<Filter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [series, setSeries] = useState<ScorePoint[]>([]);
  const [issues, setIssues] = useState<IssuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadSeries = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/scores?page_type=${pageType}`);
    if (res.ok) {
      const json = await res.json();
      setSeries(json.series);
    }
  }, [projectId, pageType]);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page_type: pageType });
    if (asOf) qs.set("as_of", asOf);
    else qs.set("status", status);
    const res = await fetch(`/api/projects/${projectId}/issues?${qs.toString()}`);
    if (res.ok) setIssues(await res.json());
    setLoading(false);
  }, [projectId, pageType, status, asOf]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const current = series.length ? series[series.length - 1].score : 100;
  const first = series.length ? series[0].score : current;
  const delta = current - first;

  async function runNow() {
    setRunning(true);
    try {
      await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "manual", page_type: pageType === "all" ? undefined : pageType }),
      });
      await Promise.all([loadSeries(), loadIssues()]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="breadcrumb">
        <a href="/">← Projects</a>
      </div>

      <div className="detail-header">
        <div>
          <h1 style={{ marginBottom: 2 }}>{domain}</h1>
          <div className="muted small">{name}</div>
        </div>
        <div className="score-line">
          <span className="muted small">Score</span>
          <span className="score-big">{current}</span>
          <span className={`delta ${deltaClass(delta)}`}>{deltaLabel(delta)}</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="muted small">Last scan {relativeTime(lastRunAt)}</span>
          <button onClick={runNow} disabled={running}>
            {running ? "Scanning…" : "Run audit now"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="filter-row">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`pill ${pageType === f ? "active" : ""}`}
              onClick={() => setPageType(f)}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>90-day SEO health {pageType !== "all" ? `· ${pageType}` : ""}</h2>
        <TrendChart data={series} selectedDate={asOf} onSelectDate={(d) => setAsOf(d)} />
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2>
            Issues on this page{" "}
            <span className="muted small">[{pageType === "all" ? "All pages" : pageType} selected]</span>
          </h2>
          {!asOf && (
            <div className="controls" style={{ margin: 0 }}>
              <label htmlFor="status">Show</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
            </div>
          )}
        </div>

        {asOf && (
          <div className="timetravel-banner">
            <span>
              🕑 Time-travel: showing the issue snapshot as of <strong>{formatDate(asOf)}</strong>
            </span>
            <button onClick={() => setAsOf(null)}>Back to current</button>
          </div>
        )}

        {loading && <div className="loading">Loading issues…</div>}
        {!loading && issues && <IssueGroups groups={issues.groups} counts={issues.counts} />}
      </div>
    </>
  );
}
