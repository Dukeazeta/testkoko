import { NextRequest, NextResponse } from "next/server";

import type { AdminAuthRequestBody } from "@/lib/admin/contracts";
import {
  ADMIN_SESSION_COOKIE,
  adminCookieMaxAgeSeconds,
  loginAdmin,
} from "@/lib/server/admin-auth-service";
import { getClientIp } from "@/lib/server/auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let payload: AdminAuthRequestBody;

  try {
    payload = (await request.json()) as AdminAuthRequestBody;
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
    const result = await loginAdmin(payload, {
      clientIp: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? "unknown",
    });

    const response = NextResponse.json(result.body, { status: result.status });
    if (result.status === 200 && result.sessionToken) {
      response.cookies.set({
        name: ADMIN_SESSION_COOKIE,
        value: result.sessionToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: adminCookieMaxAgeSeconds(),
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Admin login is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
