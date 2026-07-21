import Link from "next/link";
import { SEVERITY_WEIGHTS, CWV_THRESHOLDS, TREND_WINDOW_DAYS } from "@/lib/config";
import { CATALOG, type RuleDescriptor } from "@/lib/pipeline/analyzers/catalog";
import type { Severity } from "@/lib/types";

export const dynamic = "force-static";

const SEV_ORDER: Severity[] = ["critical", "warning", "info"];
const SEV_LABEL: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Info" };

const METHOD_LABEL: Record<string, string> = {
  raw: "raw HTML",
  rendered: "rendered DOM",
  "raw-vs-rendered": "raw vs. rendered diff",
  metrics: "Lighthouse metrics",
  http: "HTTP status checks",
};

// A concrete worked example so the number is never a black box.
const EXAMPLE = { critical: 2, warning: 3, info: 4 };

export default function MethodologyPage() {
  const examplePenalty =
    EXAMPLE.critical * SEVERITY_WEIGHTS.critical +
    EXAMPLE.warning * SEVERITY_WEIGHTS.warning +
    EXAMPLE.info * SEVERITY_WEIGHTS.info;
  const exampleScore = Math.max(0, 100 - examplePenalty);

  const byServerity = (sev: Severity) => CATALOG.filter((c) => c.severity === sev);

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">← Projects</Link>
      </div>

      <h1>Methodology</h1>
      <div className="muted" style={{ marginBottom: 4 }}>
        How the health score is computed and exactly what we check. The score is an{" "}
        <strong>internal on-page health score (0–100)</strong> — not a keyword search-ranking position.
      </div>

      {/* --- Scoring --- */}
      <div className="panel">
        <h2>How the score works</h2>
        <p className="muted">
          The score is a <strong>deterministic</strong> function of the issues currently open on a page.
          The same set of issues always produces the same score, and every point lost maps to a specific
          issue in the list below the graph — there is no black box.
        </p>
        <pre>{`score = 100 − Σ (weight of each OPEN issue)     // clamped to 0–100`}</pre>

        <h3 style={{ marginTop: 16 }}>Severity weights</h3>
        <table className="method-table">
          <thead>
            <tr><th>Severity</th><th>Points deducted per open issue</th></tr>
          </thead>
          <tbody>
            {SEV_ORDER.map((sev) => (
              <tr key={sev}>
                <td><span className={`sev-dot ${sev}`} /> {SEV_LABEL[sev]}</td>
                <td>−{SEVERITY_WEIGHTS[sev]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: 16 }}>Worked example</h3>
        <p className="muted">
          A page with {EXAMPLE.critical} critical, {EXAMPLE.warning} warning, and {EXAMPLE.info} info issues:
        </p>
        <pre>{`100 − (${EXAMPLE.critical}×${SEVERITY_WEIGHTS.critical}) − (${EXAMPLE.warning}×${SEVERITY_WEIGHTS.warning}) − (${EXAMPLE.info}×${SEVERITY_WEIGHTS.info})
= 100 − ${EXAMPLE.critical * SEVERITY_WEIGHTS.critical} − ${EXAMPLE.warning * SEVERITY_WEIGHTS.warning} − ${EXAMPLE.info * SEVERITY_WEIGHTS.info}
= ${exampleScore}`}</pre>

        <h3 style={{ marginTop: 16 }}>Aggregate & trend</h3>
        <ul className="method-list">
          <li>The <strong>“All”</strong> filter and each project card show a weighted mean across the site’s active pages.</li>
          <li>Resolved issues stop counting the moment they’re fixed, so the score recovers.</li>
          <li>The trend graph spans the last <strong>{TREND_WINDOW_DAYS} days</strong>; each point is one audit run.</li>
        </ul>
      </div>

      {/* --- Detection method --- */}
      <div className="panel">
        <h2>How we detect issues</h2>
        <p className="muted">Every audit fetches each page twice and compares them:</p>
        <ul className="method-list">
          <li><strong>Raw HTML</strong> — the pre-JavaScript response, i.e. what a non-executing crawler sees.</li>
          <li><strong>Rendered DOM</strong> — the post-JavaScript page via a headless Chromium (Playwright).</li>
          <li>
            Diffing the two surfaces <strong>render gaps</strong> — content present after JS but missing from
            raw HTML (e.g. a price that only appears client-side). This is the check generic crawlers miss on
            React / Hydrogen storefronts.
          </li>
        </ul>
        <p className="muted small">
          Checks are independent, rule-based, and explainable (no ML). Each finding records the offending
          markup as evidence and is tracked across runs with first-seen / resolved dates.
        </p>
      </div>

      {/* --- Catalog --- */}
      <div className="panel">
        <h2>Checks we run ({CATALOG.length})</h2>
        <p className="muted small">
          This list is generated from the audit engine itself, so it always reflects exactly what runs.
        </p>
        {SEV_ORDER.map((sev) => (
          <div className="sev-group" key={sev}>
            <div className="sev-head">
              <span className={`sev-dot ${sev}`} /> {SEV_LABEL[sev]} ({byServerity(sev).length})
            </div>
            <table className="method-table checks">
              <thead>
                <tr><th>Check</th><th>What we look for</th><th>Source</th></tr>
              </thead>
              <tbody>
                {byServerity(sev).map((c: RuleDescriptor) => (
                  <tr key={c.analyzerId}>
                    <td>
                      <strong>{c.title}</strong>
                      {c.pageTypes && c.pageTypes.length < 5 && (
                        <div className="muted small">{c.pageTypes.join(", ")}</div>
                      )}
                    </td>
                    <td>
                      {c.detects}
                      <div className="muted small" style={{ marginTop: 4 }}>Fix: {c.remediation}</div>
                    </td>
                    <td className="muted small">{METHOD_LABEL[c.method] ?? c.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="muted small" style={{ marginTop: 12 }}>
          Core Web Vitals thresholds: LCP ≤ {CWV_THRESHOLDS.lcpMs}ms · INP ≤ {CWV_THRESHOLDS.inpMs}ms · CLS ≤ {CWV_THRESHOLDS.cls}.
        </p>
      </div>
    </>
  );
}
