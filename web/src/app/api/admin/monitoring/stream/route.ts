import { AdminRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { getAdminMonitoring } from "@/lib/server/exam-monitoring-service";
import { requireAdminActor } from "@/lib/server/admin-auth-service";

export const runtime = "nodejs";

const encoder = new TextEncoder();

function sseChunk(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const examId = url.searchParams.get("examId") ?? undefined;

  const auth = await requireAdminActor(request, [AdminRole.SUPER_ADMIN, AdminRole.PROCTOR]);
  if (!auth.ok) {
    return new Response(JSON.stringify(auth.body), {
      status: auth.status,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  const initial = await getAdminMonitoring({ examId }, auth.actor);
  if (initial.status !== 200 || !initial.body.ok) {
    return new Response(JSON.stringify(initial.body), {
      status: initial.status,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

      const stop = () => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = undefined;
        }

        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = undefined;
        }
      };

      const pushSnapshot = async () => {
        if (closed) {
          return;
        }

        try {
          const result = await getAdminMonitoring({ examId }, auth.actor);
          if (result.status !== 200 || !result.body.ok) {
            controller.enqueue(sseChunk("error", result.body));
            closed = true;
            controller.close();
            stop();
            return;
          }

          controller.enqueue(sseChunk("snapshot", result.body.data));
        } catch {
          controller.enqueue(
            sseChunk("error", {
              ok: false,
              error: {
                code: "SERVICE_UNAVAILABLE",
                message: "Monitoring stream failed.",
              },
            }),
          );
          closed = true;
          controller.close();
          stop();
        }
      };

      void pushSnapshot();

      pollTimer = setInterval(() => {
        void pushSnapshot();
      }, 2_000);

      keepAliveTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        if (!closed) {
          closed = true;
          stop();
          controller.close();
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
