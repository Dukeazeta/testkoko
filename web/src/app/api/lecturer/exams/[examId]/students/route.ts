import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { AdminExamStudentsUpdateRequestBody } from "@/lib/exam/contracts";
import { replaceExamStudents } from "@/lib/server/admin-exam-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  let payload: AdminExamStudentsUpdateRequestBody;

  try {
    payload = (await request.json()) as AdminExamStudentsUpdateRequestBody;
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
  const result = await replaceExamStudents(examId, payload, session.user.id);
  return NextResponse.json(result.body, { status: result.status });
}
