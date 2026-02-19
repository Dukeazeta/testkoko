import { AdminRole, Prisma, SessionStatus, StrikeAction, SubmissionMode } from "@prisma/client";

import type {
  AdminActionRequestBody,
  AdminActionSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import { finalizeSubmissionBySessionId } from "@/lib/server/exam-runtime-service";
import type { AdminActor } from "@/lib/server/admin-auth-service";
import { prisma } from "@/lib/server/prisma";

type AdminActionResult =
  | {
      status: number;
      body: AdminActionSuccessResponse;
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

function actionAllowed(role: AdminRole, actionType: "force_submit" | "extend_time" | "reset_session"): boolean {
  if (role === AdminRole.SUPER_ADMIN) {
    return true;
  }

  if (role === AdminRole.PROCTOR) {
    return actionType === "force_submit" || actionType === "extend_time";
  }

  return false;
}

function resolveMonitoringStatus(input: {
  sessionStatus: SessionStatus;
  hasSubmission: boolean;
  isDisconnected: boolean;
  strikes: number;
  warningThreshold: number;
  lastAction: StrikeAction;
}): "Active" | "Disconnected" | "Flagged" | "Submitted" {
  if (input.sessionStatus === SessionStatus.submitted || input.hasSubmission) {
    return "Submitted";
  }

  if (input.sessionStatus === SessionStatus.revoked || input.sessionStatus === SessionStatus.expired) {
    return "Disconnected";
  }

  if (input.isDisconnected) {
    return "Disconnected";
  }

  const flagged = input.strikes >= input.warningThreshold || input.lastAction !== StrikeAction.NONE;
  return flagged ? "Flagged" : "Active";
}

function normalizeReason(reason: string | undefined): string | null {
  const value = reason?.trim();
  return value ? value : null;
}

export async function performAdminAction(
  payload: AdminActionRequestBody,
  actor: AdminActor,
): Promise<AdminActionResult> {
  const examId = payload.examId?.trim();
  const sessionId = payload.sessionId?.trim();
  const actionType = payload.actionType;

  if (!examId || !sessionId || !actionType) {
    return runtimeError(400, "INVALID_REQUEST", "examId, sessionId, and actionType are required.");
  }

  if (!actionAllowed(actor.role, actionType)) {
    return runtimeError(403, "FORBIDDEN", "Your role cannot perform this action.");
  }

  const session = await prisma.examSession.findFirst({
    where: {
      id: sessionId,
      examId,
    },
    include: {
      exam: {
        select: {
          id: true,
          warningThreshold: true,
        },
      },
      strikeState: true,
      submission: {
        select: {
          receiptId: true,
        },
      },
    },
  });

  if (!session || !session.exam) {
    return runtimeError(404, "SESSION_NOT_FOUND", "Session could not be found for this exam.");
  }

  const adminIdentity = `${actor.displayName} <${actor.email}>`;
  const reason = normalizeReason(payload.reason);

  if (actionType === "force_submit") {
    const finalized = await finalizeSubmissionBySessionId(session.id, SubmissionMode.timeout);

    if (finalized.blocked || !finalized.submission) {
      return runtimeError(409, "SUBMISSION_NOT_ALLOWED", "Session is not active for forced submission.");
    }

    await prisma.adminActionLog.create({
      data: {
        examId: session.examId,
        sessionId: session.id,
        candidateRecordId: session.candidateRecordId,
        actionType,
        adminUserId: actor.id,
        adminIdentity,
        metadata: {
          reason,
          receiptId: finalized.submission.receiptId,
          alreadySubmitted: finalized.alreadySubmitted,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          actionType,
          sessionId: session.id,
          status: "Submitted",
          message: finalized.alreadySubmitted
            ? "Session was already submitted. Existing receipt returned."
            : "Session force-submitted successfully.",
          submittedReceiptId: finalized.submission.receiptId,
        },
      },
    };
  }

  if (actionType === "extend_time") {
    const extraMinutes = payload.extraMinutes ?? 0;
    if (!Number.isInteger(extraMinutes) || extraMinutes < 1 || extraMinutes > 120) {
      return runtimeError(400, "INVALID_REQUEST", "extraMinutes must be an integer between 1 and 120.");
    }

    if (session.status !== SessionStatus.active) {
      return runtimeError(409, "SUBMISSION_NOT_ALLOWED", "Only active sessions can be extended.");
    }

    const now = new Date();
    const baseDeadline = new Date(
      Math.max(
        now.getTime(),
        session.expiresAt.getTime(),
        session.extendedUntil?.getTime() ?? 0,
      ),
    );
    const newDeadline = new Date(baseDeadline.getTime() + extraMinutes * 60 * 1000);

    await prisma.examSession.update({
      where: {
        id: session.id,
      },
      data: {
        expiresAt: newDeadline,
        extendedUntil: newDeadline,
      },
    });

    await prisma.adminActionLog.create({
      data: {
        examId: session.examId,
        sessionId: session.id,
        candidateRecordId: session.candidateRecordId,
        actionType,
        adminUserId: actor.id,
        adminIdentity,
        metadata: {
          reason,
          extraMinutes,
          newDeadline: newDeadline.toISOString(),
        } satisfies Prisma.InputJsonObject,
      },
    });

    const status = resolveMonitoringStatus({
      sessionStatus: session.status,
      hasSubmission: Boolean(session.submission),
      isDisconnected: session.strikeState?.isDisconnected ?? false,
      strikes: session.strikeState?.totalStrikes ?? 0,
      warningThreshold: session.exam.warningThreshold,
      lastAction: session.strikeState?.lastAction ?? StrikeAction.NONE,
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          actionType,
          sessionId: session.id,
          status,
          message: `Session extended by ${extraMinutes} minute(s).`,
          newExpiresAt: newDeadline.toISOString(),
          newExtendedUntil: newDeadline.toISOString(),
        },
      },
    };
  }

  if (actionType === "reset_session") {
    await prisma.$transaction(async (tx) => {
      await tx.examSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: SessionStatus.revoked,
          revokedAt: new Date(),
        },
      });

      await tx.strikeState.upsert({
        where: {
          sessionId: session.id,
        },
        update: {
          totalStrikes: 0,
          lastAction: StrikeAction.NONE,
          isDisconnected: false,
          lastEventType: null,
          lastEventAt: null,
        },
        create: {
          sessionId: session.id,
          examId: session.examId,
          candidateRecordId: session.candidateRecordId,
          totalStrikes: 0,
          lastAction: StrikeAction.NONE,
          isDisconnected: false,
        },
      });

      await tx.adminActionLog.create({
        data: {
          examId: session.examId,
          sessionId: session.id,
          candidateRecordId: session.candidateRecordId,
          actionType,
          adminUserId: actor.id,
          adminIdentity,
          metadata: {
            reason,
          } satisfies Prisma.InputJsonObject,
        },
      });
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          actionType,
          sessionId: session.id,
          status: "Disconnected",
          message: "Session reset. Candidate can sign in again.",
        },
      },
    };
  }

  return runtimeError(400, "INVALID_REQUEST", "Unsupported actionType.");
}
