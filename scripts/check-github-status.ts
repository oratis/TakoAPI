import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONCURRENCY = 8;

async function checkOne(skill: { id: string; githubUrl: string }) {
  try {
    const res = await fetch(skill.githubUrl, { method: "HEAD", redirect: "follow" });
    const status = res.status === 404 ? "404" : res.ok ? "ok" : "error";
    await prisma.skill.update({
      where: { id: skill.id },
      data: { ghStatus: status, ghCheckedAt: new Date() },
    });
    return status;
  } catch {
    await prisma.skill.update({
      where: { id: skill.id },
      data: { ghStatus: "error", ghCheckedAt: new Date() },
    });
    return "error";
  }
}

async function worker(queue: { id: string; githubUrl: string }[], stats: Record<string, number>) {
  while (queue.length > 0) {
    const skill = queue.shift();
    if (!skill) break;
    const status = await checkOne(skill);
    stats[status] = (stats[status] || 0) + 1;
    if ((stats.ok || 0) + (stats["404"] || 0) + (stats.error || 0) % 100 === 0) {
      console.log(`  Progress: ok=${stats.ok || 0}, 404=${stats["404"] || 0}, error=${stats.error || 0}`);
    }
  }
}

async function main() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const skills = await prisma.skill.findMany({
    where: {
      githubUrl: { not: null },
      OR: [{ ghCheckedAt: null }, { ghCheckedAt: { lt: oneWeekAgo } }],
    },
    select: { id: true, githubUrl: true },
    take: 1000,
  });

  console.log(`Checking ${skills.length} GitHub URLs (concurrency=${CONCURRENCY})...`);

  const queue = skills.filter((s): s is { id: string; githubUrl: string } => !!s.githubUrl);
  const stats: Record<string, number> = {};

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue, stats)));

  console.log(`\nDone:`);
  console.log(`  ok:    ${stats.ok || 0}`);
  console.log(`  404:   ${stats["404"] || 0}`);
  console.log(`  error: ${stats.error || 0}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
