import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import type { AdminExamCreateRequestBody } from "@/lib/exam/contracts";
import { createAdminExam, listAdminExams } from "@/lib/server/admin-exam-service";
import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await listAdminExams();
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Exam listing is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN]);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  let payload: AdminExamCreateRequestBody;
  try {
    payload = (await request.json()) as AdminExamCreateRequestBody;
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
    const result = await createAdminExam(payload, auth.actor);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Exam creation is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
