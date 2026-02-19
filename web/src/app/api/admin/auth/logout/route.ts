import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, logoutAdminByRequest } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await logoutAdminByRequest(request);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Logout failed due to a temporary server issue.",
        },
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    data: {
      loggedOut: true,
    },
  });

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
