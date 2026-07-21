"use client";
import { useState } from "react";
import { PAGE_TYPES, type PageType } from "@/lib/types";

const DEFAULT_PATHS: Record<PageType, string> = {
  home: "/",
  plp: "/collections/all",
  pdp: "/products/flagship-product",
  cart: "/cart",
  checkout: "/checkout",
};

interface PageRow {
  pageType: PageType;
  url: string;
  include: boolean;
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [rows, setRows] = useState<PageRow[]>(
    PAGE_TYPES.map((pt) => ({ pageType: pt, url: "", include: true })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanDomain = normalizeDomain(domain);

  function urlFor(row: PageRow): string {
    if (row.url.trim()) return row.url.trim();
    return cleanDomain ? `https://${cleanDomain}${DEFAULT_PATHS[row.pageType]}` : DEFAULT_PATHS[row.pageType];
  }

  function setRow(i: number, patch: Partial<PageRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !cleanDomain) {
      setError("Site name and domain are required.");
      return;
    }
    const pages = rows
      .filter((r) => r.include)
      .map((r) => ({ page_type: r.pageType, url: urlFor(r) }));
    if (pages.length === 0) {
      setError("Select at least one page to monitor.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: cleanDomain, pages }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to create project.");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New project</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <label className="field">
          <span>Site name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Store" autoFocus />
        </label>

        <label className="field">
          <span>Domain</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme-store.com" />
        </label>

        <div className="field">
          <span>Key pages to monitor</span>
          <div className="page-rows">
            {rows.map((row, i) => (
              <div className={`page-row ${row.include ? "" : "off"}`} key={row.pageType}>
                <label className="page-check">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => setRow(i, { include: e.target.checked })}
                  />
                  <span className="page-type">{row.pageType}</span>
                </label>
                <input
                  className="page-url"
                  value={row.url}
                  disabled={!row.include}
                  onChange={(e) => setRow(i, { url: e.target.value })}
                  placeholder={cleanDomain ? `https://${cleanDomain}${DEFAULT_PATHS[row.pageType]}` : DEFAULT_PATHS[row.pageType]}
                />
              </div>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Blank URLs use the default path for that page type. An initial audit runs on create.
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="primary" onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
