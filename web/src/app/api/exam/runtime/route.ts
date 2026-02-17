import { NextResponse } from "next/server";

import { getExamRuntime } from "@/lib/server/exam-runtime-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await getExamRuntime({
      examId: url.searchParams.get("examId") ?? undefined,
      sessionToken: url.searchParams.get("sessionToken") ?? undefined,
    });

    return NextResponse.json(result.body, {
      status: result.status,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Exam runtime is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
