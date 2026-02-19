import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import type { AdminRosterUploadRequestBody } from "@/lib/exam/contracts";
import { uploadExamRosterCsv } from "@/lib/server/admin-exam-service";
import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ examId: string }>;
  },
) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: AdminRosterUploadRequestBody;
  try {
    payload = (await request.json()) as AdminRosterUploadRequestBody;
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

  const params = await context.params;

  try {
    const result = await uploadExamRosterCsv(params.examId, payload, auth.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Roster upload failed due to a temporary server error.",
        },
      },
      { status: 503 },
    );
  }
}
