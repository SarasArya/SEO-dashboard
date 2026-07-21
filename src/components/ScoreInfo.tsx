"use client";
import Link from "next/link";
import { SEVERITY_WEIGHTS } from "@/lib/config";

// An "ⓘ" affordance next to a score. Hover shows how the score is computed;
// clicking opens the full Methodology page.
export function ScoreInfo() {
  return (
    <Link href="/methodology" className="score-info" aria-label="How the score is calculated">
      <span className="score-info-icon">ⓘ</span>
      <span className="score-info-tip">
        <strong>Health score (0–100)</strong>
        <br />
        Starts at 100; each <em>open</em> issue subtracts points by severity:
        <br />
        critical −{SEVERITY_WEIGHTS.critical} · warning −{SEVERITY_WEIGHTS.warning} · info −{SEVERITY_WEIGHTS.info}.
        <br />
        <span className="score-info-link">Click for full methodology →</span>
      </span>
    </Link>
  );
}
