import { NextResponse } from "next/server";
import { getIssueDetail } from "@/lib/aggregation";

// GET /issues/{id} → full lifecycle + occurrence timeline (evidence per run).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = await getIssueDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}
