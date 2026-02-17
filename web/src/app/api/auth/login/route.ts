import { NextResponse } from "next/server";

import type { CandidateLoginRequestBody } from "@/lib/auth/contracts";
import { getClientIp, loginCandidate } from "@/lib/server/auth-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: CandidateLoginRequestBody | null = null;

  try {
    payload = (await request.json()) as CandidateLoginRequestBody;
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
    const result = await loginCandidate(payload, {
      clientIp: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? "unknown",
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Authentication service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
