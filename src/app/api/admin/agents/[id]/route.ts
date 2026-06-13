import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, unauthorized, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { adminAgentUpdateSchema } from "@/lib/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = adminAgentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.agent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agent = await prisma.agent.update({
    where: { id },
    data: parsed.data,
    include: { category: { select: { name: true } } },
  });

  await logAdminAction(
    admin.id,
    "update",
    "agent",
    id,
    `Updated: ${Object.keys(parsed.data).join(", ")}`
  );

  return NextResponse.json(agent);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findUnique({ where: { id }, select: { name: true } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // AgentSkillDef + AgentTag rows cascade via FK onDelete.
  await prisma.agent.delete({ where: { id } });
  await logAdminAction(admin.id, "delete", "agent", id, `Deleted: ${agent.name}`);

  return NextResponse.json({ success: true });
}
