"use client";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { Severity } from "@/lib/types";
import type { IssueListItem } from "@/lib/aggregation";

interface IssueDetail {
  remediation: string;
  url: string;
  page_type: string;
  fingerprint: string;
  timeline: Array<{ run_date: string; severity_at_run: string; trigger: string; evidence: unknown }>;
}

function IssueRow({ issue }: { issue: IssueListItem }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/issues/${issue.id}`);
        if (res.ok) setDetail(await res.json());
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="issue">
      <div className="issue-row" onClick={toggle}>
        <span className="muted">{open ? "▾" : "▸"}</span>
        <span className="issue-title">{issue.title}</span>
        <span className={`tag ${issue.status}`}>{issue.status}</span>
        <span className="issue-dates">
          first seen {formatDate(issue.first_seen_date)}
          {issue.resolved_date ? ` → fixed ${formatDate(issue.resolved_date)}` : ""}
        </span>
      </div>
      {open && (
        <div className="issue-body">
          {loading && <div className="loading">Loading timeline…</div>}
          {detail && (
            <>
              <dt>Remediation</dt>
              <div>{detail.remediation}</div>

              <dt>Affected element / locator</dt>
              <div><code>{detail.fingerprint.slice(0, 12)}…</code> on <code>{detail.url}</code> ({detail.page_type})</div>

              <dt>Latest evidence</dt>
              <pre>{JSON.stringify(issue.latest_evidence, null, 2)}</pre>

              <dt>Occurrence timeline ({detail.timeline.length} runs)</dt>
              <ul className="timeline">
                {detail.timeline.map((t, i) => (
                  <li key={i}>
                    <span className="when">{formatDate(t.run_date)}</span>
                    <span className="tag">{t.severity_at_run}</span>
                    <span className="muted small">{t.trigger}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const SEV_LABEL: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Info" };

export function IssueGroups({
  groups,
  counts,
}: {
  groups: Record<Severity, IssueListItem[]>;
  counts: Record<Severity, number>;
}) {
  const order: Severity[] = ["critical", "warning", "info"];
  const total = counts.critical + counts.warning + counts.info;
  if (total === 0) return <div className="empty">No issues for this selection. 🎉</div>;

  return (
    <>
      {order.map((sev) => (
        <div className="sev-group" key={sev}>
          <div className="sev-head">
            <span className={`sev-dot ${sev}`} />
            {SEV_LABEL[sev]} ({counts[sev]})
          </div>
          {groups[sev].map((issue) => (
            <IssueRow key={`${issue.id}-${issue.status}`} issue={issue} />
          ))}
        </div>
      ))}
    </>
  );
}
