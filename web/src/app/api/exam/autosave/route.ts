import { NextResponse } from "next/server";

import type { ExamAutosaveRequestBody } from "@/lib/exam/contracts";
import { autosaveExamAnswer } from "@/lib/server/exam-runtime-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: ExamAutosaveRequestBody;

  try {
    payload = (await request.json()) as ExamAutosaveRequestBody;
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
    const result = await autosaveExamAnswer(payload);
    return NextResponse.json(result.body, {
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Autosave is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
