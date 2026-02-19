import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/server/admin-auth-service";
import { buildAdminAuditReport } from "@/lib/server/admin-reporting-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const url = new URL(request.url);

  try {
    const result = await buildAdminAuditReport(
      {
        examId: url.searchParams.get("examId") ?? undefined,
      },
      auth.actor,
    );

    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Audit export failed due to a temporary server error.",
        },
      },
      { status: 503 },
    );
  }
}
