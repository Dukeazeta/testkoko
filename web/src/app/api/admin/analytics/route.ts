import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/server/admin-auth-service";
import { getAdminAnalytics } from "@/lib/server/admin-reporting-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const url = new URL(request.url);

  try {
    const result = await getAdminAnalytics({
      examId: url.searchParams.get("examId") ?? undefined,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Analytics service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
