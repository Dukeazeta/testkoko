import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import type { AdminActionRequestBody } from "@/lib/exam/contracts";
import { performAdminAction } from "@/lib/server/admin-actions-service";
import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: AdminActionRequestBody;

  try {
    payload = (await request.json()) as AdminActionRequestBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await performAdminAction(payload, auth.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Admin action failed due to a temporary server error.",
        },
      },
      { status: 503 },
    );
  }
}
