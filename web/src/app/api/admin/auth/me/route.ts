import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: auth.actor.id,
      email: auth.actor.email,
      displayName: auth.actor.displayName,
      role: auth.actor.role,
      expiresAt: auth.actor.expiresAt.toISOString(),
    },
  });
}
