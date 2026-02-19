import { Prisma, SessionStatus, StrikeAction } from "@prisma/client";

import type { CandidateSessionValidationSuccessResponse } from "@/lib/auth/contracts";
import type {
  AdminTimelineRequest,
  AdminTimelineSuccessResponse,
  AdminMonitoringRequest,
  AdminMonitoringSuccessResponse,
  ExamEventIngestRequestBody,
  ExamEventIngestSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import { evaluateStrike } from "@/lib/exam/strike-engine";
import type { StrikeEventType, StrikeThresholds } from "@/lib/exam/types";
import type { AdminActor } from "@/lib/server/admin-auth-service";
import { prisma } from "@/lib/server/prisma";
import { submitExam } from "@/lib/server/exam-runtime-service";
import { validateSession } from "@/lib/server/auth-service";

type EventIngestResult =
  | {
      status: number;
      body: ExamEventIngestSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type MonitoringResult =
  | {
      status: number;
      body: AdminMonitoringSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type TimelineResult =
  | {
      status: number;
      body: AdminTimelineSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

interface ActiveSessionRecord {
  id: string;
  examId: string;
  candidateRecordId: string;
  status: SessionStatus;
  extendedUntil: Date | null;
  exam: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    warningThreshold: number;
    temporaryLockThreshold: number;
    autoSubmitThreshold: number;
    title: string;
  };
  candidate: {
    id: string;
    candidateId: string;
    displayName: string;
  };
}

function effectiveExamEnd(examEndsAt: Date, extendedUntil: Date | null): Date {
  if (!extendedUntil) {
    return examEndsAt;
  }

  return extendedUntil.getTime() > examEndsAt.getTime() ? extendedUntil : examEndsAt;
}

type ActiveSessionContext =
  | {
      ok: true;
      session: ActiveSessionRecord;
    }
  | {
      ok: false;
      status: number;
      body: ExamRuntimeErrorResponse;
    };

const acceptedEvents: StrikeEventType[] = [
  "visibility_hidden",
  "visibility_visible",
  "devtools_open",
  "multiple_session_attempt",
  "disconnect",
  "reconnect",
];

function runtimeError(
  status: number,
  code: ExamRuntimeErrorResponse["error"]["code"],
  message: string,
): { status: number; body: ExamRuntimeErrorResponse } {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
      },
    },
  };
}

function resolveStrikeActionEnum(action: "none" | "warning" | "temporary_lock" | "auto_submit"): StrikeAction {
  if (action === "warning") return StrikeAction.WARNING;
  if (action === "temporary_lock") return StrikeAction.TEMPORARY_LOCK;
  if (action === "auto_submit") return StrikeAction.AUTO_SUBMIT;
  return StrikeAction.NONE;
}

function parseEventType(input: string | undefined): StrikeEventType | null {
  if (!input) {
    return null;
  }

  return acceptedEvents.includes(input as StrikeEventType) ? (input as StrikeEventType) : null;
}

async function resolveActiveSessionContext(examId: string, sessionToken: string): Promise<ActiveSessionContext> {
  const validation = await validateSession({ examId, sessionToken });

  if (validation.status !== 200) {
    return {
      ok: false as const,
      status: validation.status,
      body: validation.body as ExamRuntimeErrorResponse,
    };
  }

  const validated = validation.body as CandidateSessionValidationSuccessResponse;
  const session = await prisma.examSession.findUnique({
    where: {
      id: validated.data.sessionId,
    },
    include: {
      exam: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          warningThreshold: true,
          temporaryLockThreshold: true,
          autoSubmitThreshold: true,
          title: true,
        },
      },
      candidate: {
        select: {
          id: true,
          candidateId: true,
          displayName: true,
        },
      },
    },
  });

  if (!session || !session.exam || !session.candidate || session.status !== SessionStatus.active) {
    return {
      ok: false,
      ...runtimeError(401, "SESSION_NOT_FOUND", "Session cannot be resolved."),
    };
  }

  return {
    ok: true,
    session,
  };
}

export async function ingestExamEvent(payload: ExamEventIngestRequestBody): Promise<EventIngestResult> {
  const examId = payload.examId?.trim();
  const sessionToken = payload.sessionToken?.trim();
  const eventType = parseEventType(payload.eventType);

  if (!examId || !sessionToken || !eventType) {
    return runtimeError(400, "INVALID_REQUEST", "examId, sessionToken, and valid eventType are required.");
  }

  const context = await resolveActiveSessionContext(examId, sessionToken);
  if (!context.ok) {
    return {
      status: context.status,
      body: context.body,
    };
  }

  const now = new Date();
  const runtimeEndsAt = effectiveExamEnd(context.session.exam.endsAt, context.session.extendedUntil);
  if (now > runtimeEndsAt) {
    return runtimeError(403, "EXAM_CLOSED", "Exam has closed. Events are no longer accepted.");
  }

  const thresholds: StrikeThresholds = {
    warning: context.session.exam.warningThreshold,
    temporaryLock: context.session.exam.temporaryLockThreshold,
    autoSubmit: context.session.exam.autoSubmitThreshold,
  };

  const strikeState = await prisma.strikeState.findUnique({
    where: {
      sessionId: context.session.id,
    },
  });

  const decision = evaluateStrike(
    strikeState?.totalStrikes ?? 0,
    {
      type: eventType,
      hiddenDurationSeconds: payload.hiddenDurationSeconds,
      timestamp: now.toISOString(),
    },
    thresholds,
  );

  const metadata: Prisma.InputJsonValue | undefined =
    payload.metadata && typeof payload.metadata === "object"
      ? ({
          ...payload.metadata,
          hiddenDurationSeconds: payload.hiddenDurationSeconds,
        } as Prisma.InputJsonObject)
      : payload.hiddenDurationSeconds !== undefined
        ? ({ hiddenDurationSeconds: payload.hiddenDurationSeconds } as Prisma.InputJsonObject)
        : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.eventLog.create({
      data: {
        sessionId: context.session.id,
        examId: context.session.examId,
        candidateRecordId: context.session.candidateRecordId,
        eventType,
        metadata,
        addedStrikes: decision.addedStrikes,
        totalStrikesAfter: decision.totalStrikes,
      },
    });

    await tx.strikeState.upsert({
      where: {
        sessionId: context.session.id,
      },
      update: {
        totalStrikes: decision.totalStrikes,
        lastAction: resolveStrikeActionEnum(decision.action),
        isDisconnected:
          eventType === "disconnect" ? true : eventType === "reconnect" ? false : (strikeState?.isDisconnected ?? false),
        lastEventType: eventType,
        lastEventAt: now,
      },
      create: {
        sessionId: context.session.id,
        examId: context.session.examId,
        candidateRecordId: context.session.candidateRecordId,
        totalStrikes: decision.totalStrikes,
        lastAction: resolveStrikeActionEnum(decision.action),
        isDisconnected: eventType === "disconnect",
        lastEventType: eventType,
        lastEventAt: now,
      },
    });
  });

  let autoSubmitted = false;
  if (decision.action === "auto_submit") {
    const submitResult = await submitExam({
      examId,
      sessionToken,
      mode: "timeout",
    });

    autoSubmitted = submitResult.status === 200 && submitResult.body.ok;
  }

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId: context.session.id,
        eventType,
        addedStrikes: decision.addedStrikes,
        totalStrikes: decision.totalStrikes,
        action: decision.action,
        autoSubmitted,
      },
    },
  };
}

export async function getAdminMonitoring(
  request: AdminMonitoringRequest,
  actor: AdminActor,
): Promise<MonitoringResult> {
  void actor;
  const examId = request.examId?.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    include: {
      sessions: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          candidate: {
            select: {
              candidateId: true,
              displayName: true,
            },
          },
          strikeState: true,
          submission: true,
        },
      },
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  const latestSessionByCandidate = new Map<string, (typeof exam.sessions)[number]>();
  for (const session of exam.sessions) {
    if (!latestSessionByCandidate.has(session.candidateRecordId)) {
      latestSessionByCandidate.set(session.candidateRecordId, session);
    }
  }

  const candidates = Array.from(latestSessionByCandidate.values()).map((session) => {
    const strikeState = session.strikeState;
    const strikes = strikeState?.totalStrikes ?? 0;
    const flagged = strikes >= exam.warningThreshold || (strikeState?.lastAction ?? StrikeAction.NONE) !== StrikeAction.NONE;

    const status: "Active" | "Disconnected" | "Flagged" | "Submitted" =
      session.status === SessionStatus.submitted || Boolean(session.submission)
        ? "Submitted"
        : session.status === SessionStatus.revoked || session.status === SessionStatus.expired
          ? "Disconnected"
        : strikeState?.isDisconnected
          ? "Disconnected"
          : flagged
            ? "Flagged"
            : "Active";

    return {
      sessionId: session.id,
      candidateId: session.candidate.candidateId,
      candidateName: session.candidate.displayName,
      status,
      strikes,
      lastEventType: strikeState?.lastEventType ?? null,
      lastEventAt: strikeState?.lastEventAt?.toISOString() ?? null,
      submittedAt: session.submittedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      extendedUntil: session.extendedUntil?.toISOString() ?? null,
    };
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId: exam.id,
        title: exam.title,
        activeCount: candidates.filter((candidate) => candidate.status === "Active").length,
        disconnectedCount: candidates.filter((candidate) => candidate.status === "Disconnected").length,
        flaggedCount: candidates.filter((candidate) => candidate.status === "Flagged").length,
        submittedCount: candidates.filter((candidate) => candidate.status === "Submitted").length,
        candidates,
      },
    },
  };
}

export async function getAdminTimeline(
  request: AdminTimelineRequest,
  actor: AdminActor,
): Promise<TimelineResult> {
  void actor;
  const examId = request.examId?.trim();
  const sessionId = request.sessionId?.trim();

  if (!examId || !sessionId) {
    return runtimeError(400, "INVALID_REQUEST", "examId and sessionId are required.");
  }

  const session = await prisma.examSession.findFirst({
    where: {
      id: sessionId,
      examId,
    },
    include: {
      candidate: {
        select: {
          candidateId: true,
          displayName: true,
        },
      },
      eventLogs: {
        orderBy: {
          createdAt: "asc",
        },
      },
      adminActions: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!session || !session.candidate) {
    return runtimeError(404, "SESSION_NOT_FOUND", "Session cannot be found for timeline view.");
  }

  const eventEntries = session.eventLogs.map((entry) => ({
    id: entry.id,
    kind: "event" as const,
    createdAt: entry.createdAt.toISOString(),
    label: entry.eventType,
    detail: `Event recorded with +${entry.addedStrikes} strikes`,
    strikeDelta: entry.addedStrikes,
    strikeTotalAfter: entry.totalStrikesAfter,
  }));

  const actionEntries = session.adminActions.map((entry) => ({
    id: entry.id,
    kind: "admin_action" as const,
    createdAt: entry.createdAt.toISOString(),
    label: entry.actionType,
    detail: entry.metadata && typeof entry.metadata === "object" ? JSON.stringify(entry.metadata) : "Admin action",
    actor: entry.adminIdentity,
  }));

  const entries = [...eventEntries, ...actionEntries].sort((left, right) => {
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId,
        sessionId,
        candidateId: session.candidate.candidateId,
        candidateName: session.candidate.displayName,
        entries,
      },
    },
  };
}
