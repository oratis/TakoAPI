import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUBLIC_CACHE_HEADERS, NO_STORE_HEADERS } from "@/lib/http";

// Skill detail by id or slug. Read-only: a GET no longer bumps viewsCount — every
// crawler, prefetch and API consumer was counted as a "view", which made the
// number meaningless. Views are recorded by the detail page itself (deduplicated
// per visitor per day) via POST /api/skills/[id]/view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const skill = await prisma.skill.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      category: true,
      // Public shape: the submitter's display name only, never their avatar URL.
      submitter: { select: { name: true } },
      _count: { select: { likes: true } },
    },
  });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Non-approved skills are only visible to their submitter or admins.
  if (skill.status !== "APPROVED") {
    const session = await auth();
    const sUser = session?.user as { id?: string; role?: string } | undefined;
    const isOwner = sUser?.id && sUser.id === skill.submitterId;
    const isAdmin = sUser?.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json(skill, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(skill, { headers: PUBLIC_CACHE_HEADERS });
}
