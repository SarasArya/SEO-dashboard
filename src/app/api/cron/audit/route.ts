import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { persistAudit, buildSnapshot, type AuditablePage } from "@/lib/pipeline/runAudit";
import { syntheticSnapshot, dayIndexFor } from "@/lib/pipeline/synthetic";
import type { PageType } from "@/lib/types";

// Daily scheduled audit (the "scheduled" cadence from §2). Invoked by Vercel
// Cron (see vercel.json). Runs one audit per active page across all projects.
// All three cadences share this pipeline; only the `trigger` field differs.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
  // configured. Reject anything else so the endpoint can't be triggered openly.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const pages = await prisma.page.findMany({ where: { isActive: true } });
  const runDate = new Date();
  const live = process.env.LIVE_AUDITS === "1";
  let ran = 0;

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
    await persistAudit(auditable, snapshot, { trigger: "scheduled", runDate });
    ran += 1;
  }

  return NextResponse.json({ ok: true, trigger: "scheduled", pages_audited: ran, run_date: runDate.toISOString() });
}
