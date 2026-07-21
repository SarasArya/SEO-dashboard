import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { persistAudit, buildSnapshot, type AuditablePage } from "@/lib/pipeline/runAudit";
import { syntheticSnapshot, dayIndexFor } from "@/lib/pipeline/synthetic";
import { isPageType, type PageType, type Trigger } from "@/lib/types";

// POST /projects/{id}/runs { page_type?, trigger }
// Manual / deploy-triggered audit. All three cadences (scheduled/manual/deploy)
// share this same pipeline and differ only by the `trigger` field.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const trigger: Trigger =
    body.trigger === "deploy" ? "deploy" : body.trigger === "scheduled" ? "scheduled" : "manual";
  const pageTypeFilter: PageType | undefined =
    typeof body.page_type === "string" && isPageType(body.page_type) ? body.page_type : undefined;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const pages = await prisma.page.findMany({
    where: { projectId: id, isActive: true, ...(pageTypeFilter ? { pageType: pageTypeFilter } : {}) },
  });
  if (pages.length === 0) return NextResponse.json({ error: "no matching pages" }, { status: 400 });

  const runDate = new Date();
  const live = process.env.LIVE_AUDITS === "1";
  const results = [];

  for (const page of pages) {
    const auditable: AuditablePage = {
      id: page.id,
      projectId: page.projectId,
      pageType: page.pageType as PageType,
      url: page.url,
    };
    const snapshot = live
      ? await buildSnapshot(auditable)
      : syntheticSnapshot(auditable, dayIndexFor(runDate));
    const result = await persistAudit(auditable, snapshot, { trigger, runDate });
    results.push({ page_id: page.id, page_type: page.pageType, ...result });
  }

  return NextResponse.json({ trigger, mode: live ? "live" : "synthetic", ran: results.length, results });
}
