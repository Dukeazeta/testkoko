import { createHash, randomUUID } from "node:crypto";

import { Prisma, SessionStatus, SubmissionMode } from "@prisma/client";

import type { CandidateSessionValidationSuccessResponse } from "@/lib/auth/contracts";
import type {
  ExamAutosaveRequestBody,
  ExamAutosaveSuccessResponse,
  ExamRuntimeErrorResponse,
  ExamRuntimeRequest,
  ExamRuntimeSuccessResponse,
  ExamSubmitRequestBody,
  ExamSubmitSuccessResponse,
} from "@/lib/exam/contracts";
import { prisma } from "@/lib/server/prisma";
import { validateSession } from "@/lib/server/auth-service";

type RuntimeResult =
  | {
    status: number;
    body: ExamRuntimeSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type AutosaveResult =
  | {
    status: number;
    body: ExamAutosaveSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type SubmitResult =
  | {
    status: number;
    body: ExamSubmitSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

export interface FinalizedSubmission {
  receiptId: string;
  submittedAt: Date;
  mode: SubmissionMode;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  scorePercent: number;
}

export interface FinalizeSubmissionResult {
  alreadySubmitted: boolean;
  blocked: boolean;
  submission: FinalizedSubmission | null;
}

type RuntimeContextResult =
  | {
    ok: true;
    session: {
      id: string;
      examId: string;
      candidateRecordId: string;
      expiresAt: Date;
      extendedUntil: Date | null;
      status: SessionStatus;
    };
    exam: {
      id: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
    };
    candidate: {
      candidateId: string;
      displayName: string;
    };
  }
  | {
    ok: false;
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

function timeRemainingSeconds(expiresAt: Date, examEndsAt: Date): number {
  const hardDeadlineMs = Math.min(expiresAt.getTime(), examEndsAt.getTime());
  return Math.max(0, Math.floor((hardDeadlineMs - Date.now()) / 1000));
}

function effectiveExamEnd(examEndsAt: Date, extendedUntil: Date | null): Date {
  if (!extendedUntil) {
    return examEndsAt;
  }

  return extendedUntil.getTime() > examEndsAt.getTime() ? extendedUntil : examEndsAt;
}

function deterministicOrderKey(sessionId: string, questionId: string): string {
  return createHash("sha256").update(`${sessionId}:${questionId}`).digest("hex");
}

function sessionTokenHash(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function parseOptions(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function resolveSubmissionMode(mode: string | undefined): SubmissionMode {
  return mode === "timeout" ? SubmissionMode.timeout : SubmissionMode.manual;
}

function createReceiptId(): string {
  return `TK-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function finalizeSubmissionBySessionId(
  sessionId: string,
  mode: SubmissionMode,
): Promise<FinalizeSubmissionResult> {
  const submittedAt = new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const existingSubmission = await tx.submission.findUnique({
        where: {
          sessionId,
        },
      });

      if (existingSubmission) {
        return {
          alreadySubmitted: true,
          blocked: false,
          submission: existingSubmission,
        };
      }

      const currentSession = await tx.examSession.findUnique({
        where: {
          id: sessionId,
        },
      });

      if (!currentSession || currentSession.status !== SessionStatus.active) {
        return {
          alreadySubmitted: false,
          blocked: true,
          submission: null,
        };
      }

      const [questionsForSession, answers] = await Promise.all([
        tx.sessionQuestion.findMany({
          where: {
            sessionId,
          },
          include: {
            question: {
              select: {
                id: true,
                correctOption: true,
              },
            },
          },
        }),
        tx.answer.findMany({
          where: {
            sessionId,
          },
          select: {
            questionId: true,
            selectedOption: true,
          },
        }),
      ]);

      const examQuestions =
        questionsForSession.length > 0
          ? questionsForSession.map((entry) => ({ id: entry.questionId, correctOption: entry.question.correctOption }))
          : await tx.question.findMany({
            where: {
              examId: currentSession.examId,
            },
            select: {
              id: true,
              correctOption: true,
            },
          });

      const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer.selectedOption]));
      const answeredQuestionIds = new Set(answers.map((answer) => answer.questionId));
      const totalQuestions = examQuestions.length;
      const answeredQuestions = examQuestions.reduce(
        (count, question) => (answeredQuestionIds.has(question.id) ? count + 1 : count),
        0,
      );
      const correctAnswers = examQuestions.reduce((count, question) => {
        return answersByQuestionId.get(question.id) === question.correctOption ? count + 1 : count;
      }, 0);

      const scorePercent = totalQuestions === 0 ? 0 : Number(((correctAnswers / totalQuestions) * 100).toFixed(2));

      const submission = await tx.submission.create({
        data: {
          sessionId,
          examId: currentSession.examId,
          candidateRecordId: currentSession.candidateRecordId,
          receiptId: createReceiptId(),
          mode,
          totalQuestions,
          answeredQuestions,
          correctAnswers,
          scorePercent,
          submittedAt,
        },
      });

      await tx.examSession.update({
        where: {
          id: sessionId,
        },
        data: {
          status: SessionStatus.submitted,
          submittedAt,
        },
      });

      return {
        alreadySubmitted: false,
        blocked: false,
        submission,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingSubmission = await prisma.submission.findUnique({
        where: {
          sessionId,
        },
      });

      if (existingSubmission) {
        return {
          alreadySubmitted: true,
          blocked: false,
          submission: existingSubmission,
        };
      }
    }

    throw error;
  }
}

function buildSubmitSuccess(
  sessionId: string,
  submission: FinalizedSubmission,
  alreadySubmitted: boolean,
): { status: number; body: ExamSubmitSuccessResponse } {
  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId,
        receiptId: submission.receiptId,
        submittedAt: submission.submittedAt.toISOString(),
        mode: submission.mode,
        totalQuestions: submission.totalQuestions,
        answeredQuestions: submission.answeredQuestions,
        correctAnswers: submission.correctAnswers,
        scorePercent: submission.scorePercent,
        alreadySubmitted,
      },
    },
  };
}

async function resolveSubmittedSession(
  examId: string | undefined,
  sessionToken: string | undefined,
): Promise<{
  sessionId: string;
  submission: FinalizedSubmission;
} | null> {
  const normalizedExamId = examId?.trim();
  const normalizedToken = sessionToken?.trim();

  if (!normalizedExamId || !normalizedToken) {
    return null;
  }

  const session = await prisma.examSession.findUnique({
    where: {
      tokenHash: sessionTokenHash(normalizedToken),
    },
    select: {
      id: true,
      examId: true,
      status: true,
    },
  });

  if (!session || session.examId !== normalizedExamId || session.status !== SessionStatus.submitted) {
    return null;
  }

  const submission = await prisma.submission.findUnique({
    where: {
      sessionId: session.id,
    },
    select: {
      receiptId: true,
      submittedAt: true,
      mode: true,
      totalQuestions: true,
      answeredQuestions: true,
      correctAnswers: true,
      scorePercent: true,
    },
  });

  if (!submission) {
    return null;
  }

  return {
    sessionId: session.id,
    submission,
  };
}

async function resolveRuntimeContext(request: ExamRuntimeRequest): Promise<RuntimeContextResult> {
  const examId = request.examId?.trim();
  const sessionToken = request.sessionToken?.trim();

  if (!examId || !sessionToken) {
    return {
      ok: false,
      ...runtimeError(400, "INVALID_REQUEST", "examId and sessionToken are required."),
    };
  }

  const validationResult = await validateSession({
    examId,
    sessionToken,
  });

  if (validationResult.status !== 200) {
    return {
      ok: false,
      status: validationResult.status,
      body: validationResult.body as ExamRuntimeErrorResponse,
    };
  }

  const validated = validationResult.body as CandidateSessionValidationSuccessResponse;

  const session = await prisma.examSession.findUnique({
    where: {
      id: validated.data.sessionId,
    },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
        },
      },
      candidate: {
        select: {
          candidateId: true,
          displayName: true,
        },
      },
    },
  });

  if (!session || !session.exam || !session.candidate) {
    return {
      ok: false,
      ...runtimeError(401, "SESSION_NOT_FOUND", "Session cannot be resolved."),
    };
  }

  return {
    ok: true,
    session: {
      id: session.id,
      examId: session.examId,
      candidateRecordId: session.candidateRecordId,
      expiresAt: session.expiresAt,
      extendedUntil: session.extendedUntil,
      status: session.status,
    },
    exam: session.exam,
    candidate: session.candidate,
  };
}

async function ensureSessionQuestionSet(sessionId: string, examId: string) {
  const existing = await prisma.sessionQuestion.findMany({
    where: {
      sessionId,
    },
    include: {
      question: true,
    },
    orderBy: {
      orderIndex: "asc",
    },
  });

  if (existing.length > 0) {
    return existing;
  }

  const questions = await prisma.question.findMany({
    where: {
      examId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (questions.length === 0) {
    return [];
  }

  const ordered = [...questions].sort((left, right) =>
    deterministicOrderKey(sessionId, left.id).localeCompare(deterministicOrderKey(sessionId, right.id)),
  );

  await prisma.sessionQuestion.createMany({
    data: ordered.map((question, index) => ({
      sessionId,
      questionId: question.id,
      orderIndex: index + 1,
    })),
  });

  return prisma.sessionQuestion.findMany({
    where: {
      sessionId,
    },
    include: {
      question: true,
    },
    orderBy: {
      orderIndex: "asc",
    },
  });
}

export async function getExamRuntime(request: ExamRuntimeRequest): Promise<RuntimeResult> {
  const context = await resolveRuntimeContext(request);
  if (!context.ok) {
    return {
      status: context.status,
      body: context.body,
    };
  }

  const now = new Date();
  const runtimeEndsAt = effectiveExamEnd(context.exam.endsAt, context.session.extendedUntil);
  if (now < context.exam.startsAt || now > runtimeEndsAt) {
    return runtimeError(403, "EXAM_CLOSED", "Exam is outside the active runtime window.");
  }

  const sessionQuestions = await ensureSessionQuestionSet(context.session.id, context.exam.id);
  if (sessionQuestions.length === 0) {
    return runtimeError(409, "NO_QUESTIONS_CONFIGURED", "No questions are configured for this exam.");
  }

  const answers = await prisma.answer.findMany({
    where: {
      sessionId: context.session.id,
    },
  });

  const answerByQuestionId = new Map(
    answers.map((answer) => [answer.questionId, { selectedOption: answer.selectedOption, savedAt: answer.savedAt }]),
  );

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId: context.session.id,
        examId: context.exam.id,
        candidateId: context.candidate.candidateId,
        candidateName: context.candidate.displayName,
        title: context.exam.title,
        timeRemainingSeconds: timeRemainingSeconds(context.session.expiresAt, runtimeEndsAt),
        questions: sessionQuestions.map((sessionQuestion) => {
          const answer = answerByQuestionId.get(sessionQuestion.questionId);

          return {
            questionId: sessionQuestion.questionId,
            orderIndex: sessionQuestion.orderIndex,
            prompt: sessionQuestion.question.prompt,
            options: parseOptions(sessionQuestion.question.options),
            selectedOption: answer?.selectedOption ?? null,
            savedAt: answer?.savedAt.toISOString() ?? null,
          };
        }),
      },
    },
  };
}

export async function autosaveExamAnswer(payload: ExamAutosaveRequestBody): Promise<AutosaveResult> {
  const questionId = payload.questionId?.trim();
  const selectedOption = payload.selectedOption?.trim();

  if (!questionId || !selectedOption) {
    return runtimeError(400, "INVALID_REQUEST", "questionId and selectedOption are required.");
  }

  const context = await resolveRuntimeContext({
    examId: payload.examId,
    sessionToken: payload.sessionToken,
  });

  if (!context.ok) {
    return {
      status: context.status,
      body: context.body,
    };
  }

  const now = new Date();
  const runtimeEndsAt = effectiveExamEnd(context.exam.endsAt, context.session.extendedUntil);
  if (now > runtimeEndsAt) {
    return runtimeError(403, "EXAM_CLOSED", "Exam has closed. Answers can no longer be updated.");
  }

  await ensureSessionQuestionSet(context.session.id, context.exam.id);

  const linkedQuestion = await prisma.sessionQuestion.findUnique({
    where: {
      sessionId_questionId: {
        sessionId: context.session.id,
        questionId,
      },
    },
  });

  if (!linkedQuestion) {
    return runtimeError(404, "INVALID_QUESTION", "Question is not part of this session.");
  }

  const saved = await prisma.answer.upsert({
    where: {
      sessionId_questionId: {
        sessionId: context.session.id,
        questionId,
      },
    },
    update: {
      selectedOption,
      savedAt: now,
    },
    create: {
      sessionId: context.session.id,
      questionId,
      selectedOption,
      savedAt: now,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId: context.session.id,
        questionId: saved.questionId,
        selectedOption: saved.selectedOption,
        savedAt: saved.savedAt.toISOString(),
      },
    },
  };
}

export async function submitExam(payload: ExamSubmitRequestBody): Promise<SubmitResult> {
  const context = await resolveRuntimeContext({
    examId: payload.examId,
    sessionToken: payload.sessionToken,
  });

  if (!context.ok) {
    if (context.body.error.code === "SESSION_REVOKED") {
      const priorSubmission = await resolveSubmittedSession(payload.examId, payload.sessionToken);
      if (priorSubmission) {
        return buildSubmitSuccess(priorSubmission.sessionId, priorSubmission.submission, true);
      }
    }

    return {
      status: context.status,
      body: context.body,
    };
  }

  const sessionQuestions = await ensureSessionQuestionSet(context.session.id, context.exam.id);
  if (sessionQuestions.length === 0) {
    return runtimeError(409, "NO_QUESTIONS_CONFIGURED", "No questions are configured for this exam.");
  }

  const mode = resolveSubmissionMode(payload.mode);
  const outcome = await finalizeSubmissionBySessionId(context.session.id, mode);

  if (outcome.blocked || !outcome.submission) {
    return runtimeError(409, "SUBMISSION_NOT_ALLOWED", "Session is not active for submission.");
  }

  return buildSubmitSuccess(context.session.id, outcome.submission, outcome.alreadySubmitted);
}
