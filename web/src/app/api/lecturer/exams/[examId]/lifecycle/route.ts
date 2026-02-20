import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { AdminExamLifecycleRequestBody } from "@/lib/exam/contracts";
import { updateExamLifecycle } from "@/lib/server/admin-exam-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  let payload: AdminExamLifecycleRequestBody;

  try {
    payload = (await request.json()) as AdminExamLifecycleRequestBody;
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

  const { examId } = await params;
  const result = await updateExamLifecycle(examId, payload, session.user.id);
  return NextResponse.json(result.body, { status: result.status });
}
