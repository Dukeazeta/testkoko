import { NextResponse } from "next/server";

import type { CandidateSessionValidationRequestBody } from "@/lib/auth/contracts";
import { validateSession } from "@/lib/server/auth-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: CandidateSessionValidationRequestBody | null = null;

  try {
    payload = (await request.json()) as CandidateSessionValidationRequestBody;
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
    const result = await validateSession(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Session validation is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
