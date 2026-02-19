import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/server/admin-auth-service";
import { getAdminTimeline } from "@/lib/server/exam-monitoring-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const url = new URL(request.url);

  try {
    const result = await getAdminTimeline(
      {
        examId: url.searchParams.get("examId") ?? undefined,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
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
          message: "Timeline service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
