import { NextRequest, NextResponse } from "next/server";
import { withAdmin, logAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, parseJson } from "@/lib/api";
import { adminUserRoleSchema } from "@/lib/schemas";
import { NO_STORE_HEADERS } from "@/lib/http";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(req, "/api/admin/users/[id]", async (admin) => {
    const { id } = await params;
    const parsed = await parseJson(req, adminUserRoleSchema);
    if (!parsed.ok) return parsed.response;
    const { role } = parsed.data;

    // Prevent removing your own admin role
    if (id === admin.id && role !== "admin") {
      return badRequest("Cannot remove your own admin role");
    }

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return notFound();

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    await logAdminAction(admin.id, "role_change", "user", id, `Set role to: ${role} (${user.email})`);

    // No catalog revalidation: role does not appear anywhere in the public catalog.
    return NextResponse.json(user, { headers: NO_STORE_HEADERS });
  });
}
