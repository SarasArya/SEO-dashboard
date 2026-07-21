// Core Web Vitals via Lighthouse (used on live audits only).
//
// Lighthouse is a lab tool: it reliably measures LCP and CLS. INP is a *field*
// metric (real user interactions) and is not produced by a lab run, so we leave
// it unset here rather than fake it — it would come from CrUX/RUM if wired.
//
// The heavy `lighthouse` + `chrome-launcher` packages are imported lazily so
// they never enter the Next bundle and offline/synthetic audits don't need them.

import type { WebVitals } from "@/lib/types";

// Minimal shape of the Lighthouse result we consume.
export interface LighthouseAudits {
  audits?: Record<string, { numericValue?: number } | undefined>;
}

// Pure, unit-testable mapping from a Lighthouse result to Web Vitals.
export function extractVitals(lhr: LighthouseAudits): WebVitals {
  const audits = lhr.audits ?? {};
  const num = (key: string): number | undefined => {
    const v = audits[key]?.numericValue;
    return typeof v === "number" ? Math.round(v * 1000) / 1000 : undefined;
  };
  const vitals: WebVitals = {};
  const lcp = num("largest-contentful-paint");
  const cls = num("cumulative-layout-shift");
  if (lcp != null) vitals.lcpMs = Math.round(lcp);
  if (cls != null) vitals.cls = cls;
  // INP intentionally omitted — not a lab metric.
  return vitals;
}

export async function runLighthouse(url: string): Promise<WebVitals | undefined> {
  try {
    const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
      import("lighthouse"),
      import("chrome-launcher"),
    ]);
    const chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless=new", "--no-sandbox"],
      chromePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || process.env.CHROME_PATH,
    });
    try {
      const result = await lighthouse(
        url,
        { port: chrome.port, output: "json", onlyCategories: ["performance"] },
        undefined,
      );
      if (!result?.lhr) return undefined;
      return extractVitals(result.lhr as unknown as LighthouseAudits);
    } finally {
      await chrome.kill();
    }
  } catch {
    // Lighthouse/Chrome unavailable — degrade gracefully (no CWV findings).
    return undefined;
  }
}
