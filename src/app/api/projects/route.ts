import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProjectCards } from "@/lib/aggregation";
import { persistAudit, buildSnapshot, type AuditablePage } from "@/lib/pipeline/runAudit";
import { syntheticSnapshot, dayIndexFor } from "@/lib/pipeline/synthetic";
import { DEFAULT_PAGE_PATHS } from "@/lib/config";
import { isPageType, PAGE_TYPES, type PageType } from "@/lib/types";

// GET /projects → cards for Screen A.
export async function GET() {
  const cards = await getProjectCards();
  return NextResponse.json({ projects: cards });
}

interface NewPage {
  page_type: PageType;
  url: string;
}

// POST /projects { name, domain, pages?: [{ page_type, url }] }
// Registers a project + its key pages and runs an initial audit so the card has
// data immediately. If pages are omitted, scaffolds one page per page type from
// the domain using the default paths.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.domain !== "string") {
    return NextResponse.json({ error: "name and domain are required" }, { status: 400 });
  }

  const name = body.name.trim();
  const domain = normalizeDomain(body.domain);
  if (!name || !domain) {
    return NextResponse.json({ error: "name and domain must not be empty" }, { status: 400 });
  }

  // Resolve the page list.
  let pages: NewPage[];
  if (Array.isArray(body.pages) && body.pages.length > 0) {
    pages = body.pages
      .filter((p: unknown): p is NewPage => {
        const pp = p as Partial<NewPage>;
        return typeof pp?.url === "string" && typeof pp?.page_type === "string" && isPageType(pp.page_type);
      })
      .map((p: NewPage) => ({ page_type: p.page_type, url: p.url.trim() }))
      .filter((p: NewPage) => p.url.length > 0);
  } else {
    pages = PAGE_TYPES.map((pt) => ({ page_type: pt, url: `https://${domain}${DEFAULT_PAGE_PATHS[pt]}` }));
  }
  if (pages.length === 0) {
    return NextResponse.json({ error: "at least one page is required" }, { status: 400 });
  }

  const project = await prisma.project.create({ data: { name, domain } });
  const created = await Promise.all(
    pages.map((p) =>
      prisma.page.create({
        data: { projectId: project.id, pageType: p.page_type, url: p.url, isActive: true },
      }),
    ),
  );

  // Initial audit so the project isn't empty on the dashboard.
  const runDate = new Date();
  const live = process.env.LIVE_AUDITS === "1";
  for (const page of created) {
    const auditable: AuditablePage = {
      id: page.id,
      projectId: page.projectId,
      pageType: page.pageType as PageType,
      url: page.url,
    };
    const snapshot = live
      ? await buildSnapshot(auditable)
      : syntheticSnapshot(auditable, dayIndexFor(runDate));
    await persistAudit(auditable, snapshot, { trigger: "manual", runDate });
  }

  return NextResponse.json(
    { id: project.id, name: project.name, domain: project.domain, pages: created.length },
    { status: 201 },
  );
}

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d;
}
