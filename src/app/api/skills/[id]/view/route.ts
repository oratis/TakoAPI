import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordSkillView } from "@/lib/views";

// Record one page view for a skill, deduplicated per visitor per UTC day. Called
// by the detail page after it renders (a crawler fetching the JSON API no longer
// counts). Never fails the caller: a lost view is not worth an error.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await prisma.skill.findFirst({
    where: { OR: [{ id }, { slug: id }], status: "APPROVED" },
    select: { id: true },
  });
  if (!skill) return NextResponse.json({ counted: false }, { status: 404 });
  const counted = await recordSkillView(skill.id, req);
  return NextResponse.json({ counted }, { headers: { "Cache-Control": "private, no-store" } });
}
