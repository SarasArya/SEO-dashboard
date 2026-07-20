// Renderer — renders the post-JS DOM with Playwright (§4).
//
// Diffing raw (fetcher) vs. rendered (here) is how we catch render gaps:
// content present after JS but missing from the raw HTML. Critical for
// React / Hydrogen storefronts.
//
// Playwright is optional at runtime. If a browser can't be launched (no network,
// missing binary, sandbox), we fall back to the raw HTML and mark rendered=false
// so analyzers can degrade gracefully rather than crash the pipeline.

export interface RenderResult {
  renderedHtml: string;
  rendered: boolean;
  error?: string;
}

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";

export async function renderDom(url: string, timeoutMs = 20000): Promise<RenderResult> {
  try {
    // Import lazily so environments without Playwright still load the module.
    const { chromium } = await import("playwright");
    const launchOpts: Record<string, unknown> = { headless: true };
    // Respect a pinned executable if the managed browser path exists.
    const fs = await import("node:fs");
    if (fs.existsSync(CHROMIUM_PATH)) launchOpts.executablePath = CHROMIUM_PATH;

    const browser = await chromium.launch(launchOpts);
    try {
      const page = await browser.newPage({
        userAgent: "SEO-Health-Dashboard/0.1 (+audit-bot; render)",
      });
      await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
      const renderedHtml = await page.content();
      return { renderedHtml, rendered: true };
    } finally {
      await browser.close();
    }
  } catch (err) {
    return {
      renderedHtml: "",
      rendered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
