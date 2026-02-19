import { SessionStatus, StrikeAction } from "@prisma/client";

import type {
  AdminAnalyticsRequest,
  AdminAnalyticsSuccessResponse,
  AdminAuditReportRequest,
  AdminAuditReportSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import type { AdminActor } from "@/lib/server/admin-auth-service";
import { prisma } from "@/lib/server/prisma";

type AdminAnalyticsResult =
  | {
      status: number;
      body: AdminAnalyticsSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type AdminAuditReportResult =
  | {
      status: number;
      body: AdminAuditReportSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

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

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export async function getAdminAnalytics(request: AdminAnalyticsRequest): Promise<AdminAnalyticsResult> {
  const examId = request.examId?.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    select: {
      id: true,
      warningThreshold: true,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  const [registeredCandidates, submittedRows, activeSessions, strikeStates, strikeEvents, abuseAttemptEvents, answers] =
    await Promise.all([
      prisma.candidate.count({
        where: {
          examId,
        },
      }),
      prisma.submission.findMany({
        where: {
          examId,
        },
        select: {
          candidateRecordId: true,
        },
        distinct: ["candidateRecordId"],
      }),
      prisma.examSession.count({
        where: {
          examId,
          status: SessionStatus.active,
        },
      }),
      prisma.strikeState.findMany({
        where: {
          examId,
        },
        select: {
          candidateRecordId: true,
          totalStrikes: true,
          lastAction: true,
        },
      }),
      prisma.eventLog.count({
        where: {
          examId,
          addedStrikes: {
            gt: 0,
          },
        },
      }),
      prisma.eventLog.count({
        where: {
          examId,
          eventType: {
            in: ["multiple_session_attempt", "devtools_open"],
          },
        },
      }),
      prisma.answer.findMany({
        where: {
          session: {
            examId,
          },
        },
        select: {
          sessionId: true,
          savedAt: true,
        },
        orderBy: [
          {
            sessionId: "asc",
          },
          {
            savedAt: "asc",
          },
        ],
      }),
    ]);

  const submittedCandidates = submittedRows.length;
  const flaggedCandidateIds = new Set(
    strikeStates
      .filter(
        (state) => state.totalStrikes >= exam.warningThreshold || (state.lastAction ?? StrikeAction.NONE) !== StrikeAction.NONE,
      )
      .map((state) => state.candidateRecordId),
  );

  const totalStrikeSum = strikeStates.reduce((sum, state) => sum + state.totalStrikes, 0);

  const answerIntervalsSeconds: number[] = [];
  const lastSavedBySession = new Map<string, number>();
  for (const answer of answers) {
    const current = answer.savedAt.getTime();
    const previous = lastSavedBySession.get(answer.sessionId);
    if (previous !== undefined) {
      answerIntervalsSeconds.push((current - previous) / 1000);
    }
    lastSavedBySession.set(answer.sessionId, current);
  }

  const submissionSuccessRate = registeredCandidates === 0 ? 0 : (submittedCandidates / registeredCandidates) * 100;
  const flaggedRate = registeredCandidates === 0 ? 0 : (flaggedCandidateIds.size / registeredCandidates) * 100;
  const averageStrikesPerCandidate = registeredCandidates === 0 ? 0 : totalStrikeSum / registeredCandidates;

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId,
        generatedAt: new Date().toISOString(),
        totals: {
          registeredCandidates,
          submittedCandidates,
          flaggedCandidates: flaggedCandidateIds.size,
          activeSessions,
        },
        rates: {
          submissionSuccessRate: roundMetric(submissionSuccessRate),
          flaggedRate: roundMetric(flaggedRate),
        },
        integrity: {
          strikeEvents,
          abuseAttemptEvents,
          averageStrikesPerCandidate: roundMetric(averageStrikesPerCandidate),
        },
        reliability: {
          autosaveCadenceP95Seconds: percentile(answerIntervalsSeconds, 0.95),
        },
      },
    },
  };
}

export async function buildAdminAuditReport(
  request: AdminAuditReportRequest,
  actor: AdminActor,
): Promise<AdminAuditReportResult> {
  const examId = request.examId?.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    select: {
      id: true,
      accessCode: true,
      title: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  const [candidates, sessions] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        examId,
      },
      orderBy: {
        candidateId: "asc",
      },
      select: {
        id: true,
        candidateId: true,
        displayName: true,
      },
    }),
    prisma.examSession.findMany({
      where: {
        examId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        submission: {
          select: {
            submittedAt: true,
            scorePercent: true,
          },
        },
        strikeState: {
          select: {
            totalStrikes: true,
            lastEventType: true,
          },
        },
        eventLogs: {
          select: {
            eventType: true,
            addedStrikes: true,
            totalStrikesAfter: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        adminActions: {
          select: {
            actionType: true,
            adminIdentity: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    }),
  ]);

  const latestSessionByCandidate = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions) {
    if (!latestSessionByCandidate.has(session.candidateRecordId)) {
      latestSessionByCandidate.set(session.candidateRecordId, session);
    }
  }

  const candidateRows = candidates.map((candidate) => {
    const session = latestSessionByCandidate.get(candidate.id);
    return {
      candidateId: candidate.candidateId,
      candidateName: candidate.displayName,
      sessionId: session?.id ?? null,
      sessionStatus: session?.status ?? null,
      submittedAt: session?.submission?.submittedAt?.toISOString() ?? null,
      scorePercent: session?.submission?.scorePercent ?? null,
      strikes: session?.strikeState?.totalStrikes ?? 0,
      lastEventType: session?.strikeState?.lastEventType ?? null,
      events:
        session?.eventLogs.map((entry) => ({
          eventType: entry.eventType,
          addedStrikes: entry.addedStrikes,
          totalStrikesAfter: entry.totalStrikesAfter,
          createdAt: entry.createdAt.toISOString(),
        })) ?? [],
      adminActions:
        session?.adminActions.map((entry) => ({
          actionType: entry.actionType,
          adminIdentity: entry.adminIdentity,
          metadata: entry.metadata,
          createdAt: entry.createdAt.toISOString(),
        })) ?? [],
    };
  });

  await prisma.adminActionLog.create({
    data: {
      examId,
      actionType: "export_audit_report",
      adminUserId: actor.id,
      adminIdentity: `${actor.displayName} <${actor.email}>`,
      metadata: {
        candidateCount: candidateRows.length,
      },
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        exam: {
          examId: exam.id,
          accessCode: exam.accessCode,
          title: exam.title,
          startsAt: exam.startsAt.toISOString(),
          endsAt: exam.endsAt.toISOString(),
          generatedAt: new Date().toISOString(),
        },
        candidates: candidateRows,
      },
    },
  };
}
