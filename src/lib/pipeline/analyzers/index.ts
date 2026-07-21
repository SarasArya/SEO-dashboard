// Analyzer registry (§6). Each analyzer is independent; the pipeline runs them
// all and flattens the findings.
import type { Analyzer, Finding, PageSnapshot } from "@/lib/types";
import { criticalAnalyzers } from "./critical";
import { warningAnalyzers } from "./warning";
import { infoAnalyzers } from "./info";

// How an analyzer obtains its signal (documented on the Methodology page).
export type IngestMethod = "raw" | "rendered" | "raw-vs-rendered" | "metrics" | "http";

export const ANALYZERS: Analyzer[] = [
  ...criticalAnalyzers,
  ...warningAnalyzers,
  ...infoAnalyzers,
];

export function runAnalyzers(snapshot: PageSnapshot, analyzers: Analyzer[] = ANALYZERS): Finding[] {
  const findings: Finding[] = [];
  for (const analyzer of analyzers) {
    try {
      findings.push(...analyzer.run(snapshot));
    } catch {
      // An analyzer failure must not sink the whole run; skip and continue.
    }
  }
  return findings;
}
