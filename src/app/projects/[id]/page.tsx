import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectDetailClient } from "@/components/ProjectDetailClient";

export const dynamic = "force-dynamic";

// Screen B — Project Detail. The server component resolves the project; the
// client component drives the page filter, graph series, time-travel, and
// issue drill-down against the BFF endpoints.
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const lastRun = await prisma.run.findFirst({
    where: { projectId: id },
    orderBy: { runDate: "desc" },
    select: { runDate: true },
  });

  return (
    <ProjectDetailClient
      projectId={project.id}
      name={project.name}
      domain={project.domain}
      lastRunAt={lastRun ? lastRun.runDate.toISOString() : null}
    />
  );
}
