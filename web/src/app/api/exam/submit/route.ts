import { NextResponse } from "next/server";

import type { ExamSubmitRequestBody } from "@/lib/exam/contracts";
import { submitExam } from "@/lib/server/exam-runtime-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: ExamSubmitRequestBody;

  try {
    payload = (await request.json()) as ExamSubmitRequestBody;
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
    const result = await submitExam(payload);
    return NextResponse.json(result.body, {
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Submission is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
