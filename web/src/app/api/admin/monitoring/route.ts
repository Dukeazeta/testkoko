import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getAdminMonitoring } from "@/lib/server/exam-monitoring-service";
import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await getAdminMonitoring(
      {
        examId: url.searchParams.get("examId") ?? undefined,
      },
      auth.actor,
    );

    return NextResponse.json(result.body, {
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Monitoring service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
