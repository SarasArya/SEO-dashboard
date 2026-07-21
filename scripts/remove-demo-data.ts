// Remove the seeded demo projects (the *.example sites: Nimbus Store, Harbor
// Goods, Volt Outfitters) and all their audit history. Real projects — anything
// not on an `.example` domain — are left untouched.
//
//   yarn db:remove-demo            # remove all *.example demo projects
//   yarn db:remove-demo <domain>   # remove one specific project by domain
//
// Deletes children explicitly in dependency order so it works regardless of DB
// cascade configuration.

import { prisma } from "@/lib/db";

async function main() {
  const arg = process.argv[2];
  const where = arg
    ? { domain: arg.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase() }
    : { domain: { endsWith: ".example" } };

  const projects = await prisma.project.findMany({
    where,
    select: { id: true, name: true, domain: true },
  });

  if (projects.length === 0) {
    console.log(arg ? `No project found for "${arg}".` : "No demo (*.example) projects to remove.");
    return;
  }

  console.log("Removing:");
  projects.forEach((p) => console.log(`  • ${p.name} (${p.domain})`));

  const projectId = { in: projects.map((p) => p.id) };
  await prisma.$transaction([
    prisma.issueOccurrence.deleteMany({ where: { projectId } }),
    prisma.issue.deleteMany({ where: { projectId } }),
    prisma.pageScore.deleteMany({ where: { projectId } }),
    prisma.run.deleteMany({ where: { projectId } }),
    prisma.page.deleteMany({ where: { projectId } }),
    prisma.project.deleteMany({ where: { id: projectId } }),
  ]);

  const remaining = await prisma.project.count();
  console.log(`Removed ${projects.length} project(s). ${remaining} project(s) remain.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
