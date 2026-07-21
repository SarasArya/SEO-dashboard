import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Health Dashboard",
  description: "On-page SEO health monitoring over time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="dot" />
              SEO Health
              <small>· on-page monitoring</small>
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
