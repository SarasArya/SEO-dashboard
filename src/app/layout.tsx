import type { Metadata } from "next";
import Link from "next/link";
import { auditMode } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Health Dashboard",
  description: "On-page SEO health monitoring over time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = auditMode();
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla's
          cz-shortcut-listen) inject attributes on <body> before React hydrates.
          This suppresses that one-level attribute mismatch only. */}
      <body suppressHydrationWarning>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="dot" />
              SEO Health
              <small>· on-page monitoring</small>
              {mode === "synthetic" && <span className="demo-chip" title="Audits use synthetic data; set LIVE_AUDITS=1 to crawl real URLs">Demo data</span>}
            </Link>
            <Link href="/methodology" className="muted small nav-link">
              internal health score · 0–100 · <span className="nav-em">Methodology</span>
            </Link>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
