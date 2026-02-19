import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import type { AdminSimilarityRunRequestBody } from "@/lib/exam/contracts";
import { requireAdminActor } from "@/lib/server/admin-auth-service";
import { runSimilarityDetection } from "@/lib/server/similarity-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: AdminSimilarityRunRequestBody;
  try {
    payload = (await request.json()) as AdminSimilarityRunRequestBody;
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
    const result = await runSimilarityDetection(payload, auth.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Similarity run failed due to a temporary server error.",
        },
      },
      { status: 503 },
    );
  }
}
