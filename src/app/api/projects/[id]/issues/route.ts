import { NextRequest, NextResponse } from "next/server";
import { getIssues } from "@/lib/aggregation";
import { isPageType, type PageType } from "@/lib/types";

// GET /projects/{id}/issues?page_type=pdp&status=open&as_of=<date>
// as_of time-travels to a graph point's run date (reads issue_occurrences).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;

  const pageTypeParam = sp.get("page_type") ?? "all";
  const pageType: PageType | "all" =
    pageTypeParam === "all" ? "all" : isPageType(pageTypeParam) ? pageTypeParam : "all";

  const statusParam = sp.get("status") ?? "open";
  const status: "open" | "resolved" | "all" =
    statusParam === "resolved" ? "resolved" : statusParam === "all" ? "all" : "open";

  const asOf = sp.get("as_of") ? new Date(sp.get("as_of")!) : undefined;

  const result = await getIssues(id, pageType, status, asOf);
  return NextResponse.json(result);
}
