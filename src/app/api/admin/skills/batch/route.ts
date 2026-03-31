import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { action, ids } = await req.json() as { action: string; ids: string[] };

  if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Missing action or ids" }, { status: 400 });
  }

  let affected = 0;

  switch (action) {
    case "approve":
      affected = (await prisma.skill.updateMany({ where: { id: { in: ids } }, data: { status: "approved" } })).count;
      break;
    case "reject":
      affected = (await prisma.skill.updateMany({ where: { id: { in: ids } }, data: { status: "rejected" } })).count;
      break;
    case "feature":
      affected = (await prisma.skill.updateMany({ where: { id: { in: ids } }, data: { featured: true } })).count;
      break;
    case "unfeature":
      affected = (await prisma.skill.updateMany({ where: { id: { in: ids } }, data: { featured: false } })).count;
      break;
    case "delete":
      await prisma.like.deleteMany({ where: { skillId: { in: ids } } });
      affected = (await prisma.skill.deleteMany({ where: { id: { in: ids } } })).count;
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  await logAdminAction(admin.id, action, "skill", ids.join(","), `Batch ${action}: ${affected} skills`);

  return NextResponse.json({ success: true, affected });
}
