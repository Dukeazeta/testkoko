import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { AdminExamUpdateRequestBody } from "@/lib/exam/contracts";
import { getExamDetail, updateExamDetails } from "@/lib/server/admin-exam-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const { examId } = await params;
  const result = await getExamDetail(examId, session.user.id);
  return NextResponse.json(result.body, { status: result.status });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  let payload: AdminExamUpdateRequestBody;

  try {
    payload = (await request.json()) as AdminExamUpdateRequestBody;
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
  const result = await updateExamDetails(examId, payload, session.user.id);
  return NextResponse.json(result.body, { status: result.status });
}
