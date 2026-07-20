import { NextResponse } from "next/server";
import { getProjectCards } from "@/lib/aggregation";

// GET /projects → cards for Screen A.
export async function GET() {
  const cards = await getProjectCards();
  return NextResponse.json({ projects: cards });
}
