import { getProjectCards } from "@/lib/aggregation";
import { OverviewClient } from "@/components/OverviewClient";

export const dynamic = "force-dynamic";

// Screen A — Projects Overview. Aggregation happens server-side in the BFF layer;
// the client component only handles sorting/filtering interactivity.
export default async function OverviewPage() {
  const projects = await getProjectCards();
  return <OverviewClient projects={projects} />;
}
