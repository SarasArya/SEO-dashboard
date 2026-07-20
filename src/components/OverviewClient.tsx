"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Sparkline } from "./Sparkline";
import { deltaClass, deltaLabel, relativeTime } from "@/lib/format";
import type { ProjectCard } from "@/lib/aggregation";

type SortKey = "score" | "last_scanned" | "critical";

export function OverviewClient({ projects }: { projects: ProjectCard[] }) {
  const [sort, setSort] = useState<SortKey>("critical");

  const sorted = useMemo(() => {
    const list = [...projects];
    switch (sort) {
      case "score":
        return list.sort((a, b) => a.current_score - b.current_score);
      case "last_scanned":
        return list.sort(
          (a, b) => new Date(b.last_run_at ?? 0).getTime() - new Date(a.last_run_at ?? 0).getTime(),
        );
      case "critical":
      default:
        return list.sort((a, b) => b.critical_open_count - a.critical_open_count);
    }
  }, [projects, sort]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1>Projects</h1>
          <div className="muted small">{projects.length} monitored sites · 90-day window</div>
        </div>
        <div className="controls">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="critical">Critical issues</option>
            <option value="score">Lowest score</option>
            <option value="last_scanned">Last scanned</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">No projects yet. Run <code>npm run db:seed</code> to load demo data.</div>
      ) : (
        <div className="card-grid" style={{ marginTop: 18 }}>
          {sorted.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card">
              <div className="card-top">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="favicon">{p.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="site-name">{p.name}</div>
                    <div className="domain">{p.domain}</div>
                  </div>
                </div>
                {p.critical_open_count > 0 && (
                  <span className="badge critical">{p.critical_open_count} critical</span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
                <span className="score-big">{p.current_score}</span>
                <span className={`delta ${deltaClass(p.score_delta_90d)}`}>{deltaLabel(p.score_delta_90d)}</span>
                <span className="muted small">vs. 90d ago</span>
              </div>

              <div style={{ marginTop: 8 }}>
                <Sparkline data={p.sparkline} />
              </div>

              <div className="card-meta">
                <span>{p.domain}</span>
                <span>scanned {relativeTime(p.last_run_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
