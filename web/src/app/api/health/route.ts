import { prisma } from "@/lib/server/prisma";
import { getRedisClient } from "@/lib/server/redis";

export const runtime = "nodejs";

export async function GET() {
  const timestamp = new Date().toISOString();

  let postgres = "down";
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgres = "up";
  } catch {
    postgres = "down";
  }

  let redis = "down";
  try {
    const client = await getRedisClient();
    if (client) {
      const pong = await client.ping();
      redis = pong === "PONG" ? "up" : "down";
    } else {
      redis = "degraded";
    }
  } catch {
    redis = "down";
  }

  const overall = postgres === "up" && (redis === "up" || redis === "degraded") ? "ok" : "degraded";

  return Response.json(
    {
      ok: overall === "ok",
      status: overall,
      timestamp,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        postgres,
        redis,
      },
    },
    { status: overall === "ok" ? 200 : 503 },
  );
}
