import { NextRequest, NextResponse } from "next/server";
import { getScoreSeries } from "@/lib/aggregation";
import { isPageType, type PageType } from "@/lib/types";

// GET /projects/{id}/scores?page_type=pdp&from=&to= → graph series.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const pageTypeParam = sp.get("page_type") ?? "all";
  const pageType: PageType | "all" =
    pageTypeParam === "all" ? "all" : isPageType(pageTypeParam) ? pageTypeParam : "all";

  const from = sp.get("from") ? new Date(sp.get("from")!) : undefined;
  const to = sp.get("to") ? new Date(sp.get("to")!) : undefined;

  const series = await getScoreSeries(id, pageType, from, to);
  return NextResponse.json({ page_type: pageType, series });
}
