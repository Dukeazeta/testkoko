import { NextResponse } from "next/server";

import type { ExamEventIngestRequestBody } from "@/lib/exam/contracts";
import { ingestExamEvent } from "@/lib/server/exam-monitoring-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: ExamEventIngestRequestBody;

  try {
    payload = (await request.json()) as ExamEventIngestRequestBody;
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
    const result = await ingestExamEvent(payload);
    return NextResponse.json(result.body, {
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Event ingestion is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
