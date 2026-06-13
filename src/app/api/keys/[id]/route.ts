import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound } from "@/lib/api";

// Revoke an API key (owner only). Soft-delete via revokedAt so usage history stays intact.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { userId: true } });
  if (!key || key.userId !== session.user.id) return notFound("Key not found");

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ success: true });
}
