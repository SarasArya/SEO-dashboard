// Seed 90 days of deterministic SEO history by driving the REAL audit pipeline
// (synthetic snapshot → analyzers → scorer → lifecycle diff → persist) once per
// page per day. This produces authentic trends, lifecycle transitions, and
// time-travel snapshots — not hand-faked numbers.

import { prisma } from "@/lib/db";
import { persistAudit, type AuditablePage } from "@/lib/pipeline/runAudit";
import { syntheticSnapshot, dateForDayIndex, WINDOW_DAYS } from "@/lib/pipeline/synthetic";
import { PAGE_TYPES, type PageType, type Trigger } from "@/lib/types";

interface SeedProject {
  name: string;
  domain: string;
}

const PROJECTS: SeedProject[] = [
  { name: "Nimbus Store", domain: "nimbus-store.example" },
  { name: "Volt Outfitters", domain: "voltoutfitters.example" },
  { name: "Harbor Goods", domain: "harborgoods.example" },
];

const URL_FOR: Record<PageType, string> = {
  home: "/",
  plp: "/collections/all",
  pdp: "/products/flagship-widget",
  cart: "/cart",
  checkout: "/checkout",
};

// Annotate a few runs as deploy/manual to make the trigger field meaningful.
function triggerFor(dayIndex: number): Trigger {
  if (dayIndex % 20 === 0 && dayIndex > 0) return "deploy";
  if (dayIndex % 27 === 0 && dayIndex > 0) return "manual";
  return "scheduled";
}

async function main() {
  console.log("Clearing existing data…");
  await prisma.issueOccurrence.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.pageScore.deleteMany();
  await prisma.run.deleteMany();
  await prisma.page.deleteMany();
  await prisma.project.deleteMany();

  const now = new Date();

  for (const sp of PROJECTS) {
    const project = await prisma.project.create({ data: { name: sp.name, domain: sp.domain } });
    const pages = [];
    for (const pageType of PAGE_TYPES) {
      const page = await prisma.page.create({
        data: {
          projectId: project.id,
          pageType,
          url: `https://${sp.domain}${URL_FOR[pageType]}`,
          isActive: true,
        },
      });
      pages.push(page);
    }

    console.log(`Auditing ${sp.name} — ${pages.length} pages × ${WINDOW_DAYS} days…`);
    for (let dayIndex = 0; dayIndex < WINDOW_DAYS; dayIndex++) {
      const runDate = dateForDayIndex(dayIndex, now);
      const trigger = triggerFor(dayIndex);
      for (const page of pages) {
        const auditable: AuditablePage = {
          id: page.id,
          projectId: page.projectId,
          pageType: page.pageType as PageType,
          url: page.url,
        };
        const snapshot = syntheticSnapshot(auditable, dayIndex);
        await persistAudit(auditable, snapshot, { trigger, runDate });
      }
    }
  }

  const [projects, runs, issues, occurrences] = await Promise.all([
    prisma.project.count(),
    prisma.run.count(),
    prisma.issue.count(),
    prisma.issueOccurrence.count(),
  ]);
  console.log(
    `Done: ${projects} projects, ${runs} runs, ${issues} issues, ${occurrences} occurrences.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
