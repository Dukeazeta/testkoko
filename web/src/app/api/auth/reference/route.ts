import { NextResponse } from "next/server";

import { getSeededAuthReference } from "@/lib/server/auth-service";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: "Not available.",
        },
      },
      { status: 404 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      data: await getSeededAuthReference(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Reference data is unavailable until the database is ready.",
        },
      },
      { status: 503 },
    );
  }
}
