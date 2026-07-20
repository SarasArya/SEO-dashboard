// Fetcher — pulls the raw pre-JS HTML for a URL (§4).
//
// This is the "before JavaScript" view. Diffing it against the rendered DOM is
// what surfaces render gaps on JS-heavy / React / Hydrogen storefronts.

export interface FetchResult {
  ok: boolean;
  status: number;
  rawHtml: string;
  finalUrl: string;
  error?: string;
}

export async function fetchRaw(url: string, timeoutMs = 15000): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Identify ourselves; some origins vary output by UA.
        "user-agent": "SEO-Health-Dashboard/0.1 (+audit-bot)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const rawHtml = await res.text();
    return { ok: res.ok, status: res.status, rawHtml, finalUrl: res.url || url };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      rawHtml: "",
      finalUrl: url,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
