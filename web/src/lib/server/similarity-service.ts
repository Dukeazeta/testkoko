import { Prisma, SessionStatus } from "@prisma/client";

import type {
  AdminSimilarityListRequest,
  AdminSimilarityListSuccessResponse,
  AdminSimilarityRunRequestBody,
  AdminSimilarityRunSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import type { AdminActor } from "@/lib/server/admin-auth-service";
import { prisma } from "@/lib/server/prisma";

type SimilarityRunResult =
  | {
      status: number;
      body: AdminSimilarityRunSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type SimilarityListResult =
  | {
      status: number;
      body: AdminSimilarityListSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

interface SessionAnswerContext {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  answers: Map<string, { option: string; savedAt: number }>;
}

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

function clampUnit(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function parseNormalizedWeight(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value < 0 || value > 1) {
    return Number.NaN;
  }

  return value;
}

function computePairScore(
  left: SessionAnswerContext,
  right: SessionAnswerContext,
  answerWeight: number,
  timingWeight: number,
): {
  commonAnswered: number;
  matchingAnswers: number;
  answerSimilarity: number;
  timingSimilarity: number;
  combinedScore: number;
} {
  let commonAnswered = 0;
  let matchingAnswers = 0;
  let timingDeltaTotal = 0;

  for (const [questionId, leftAnswer] of left.answers.entries()) {
    const rightAnswer = right.answers.get(questionId);
    if (!rightAnswer) {
      continue;
    }

    commonAnswered += 1;
    if (leftAnswer.option === rightAnswer.option) {
      matchingAnswers += 1;
    }

    timingDeltaTotal += Math.abs(leftAnswer.savedAt - rightAnswer.savedAt) / 1000;
  }

  if (commonAnswered === 0) {
    return {
      commonAnswered: 0,
      matchingAnswers: 0,
      answerSimilarity: 0,
      timingSimilarity: 0,
      combinedScore: 0,
    };
  }

  const answerSimilarity = matchingAnswers / commonAnswered;
  const averageTimingDeltaSeconds = timingDeltaTotal / commonAnswered;
  const timingSimilarity = clampUnit(1 - averageTimingDeltaSeconds / 120);
  const combinedScore = answerSimilarity * answerWeight + timingSimilarity * timingWeight;

  return {
    commonAnswered,
    matchingAnswers,
    answerSimilarity: roundScore(answerSimilarity),
    timingSimilarity: roundScore(timingSimilarity),
    combinedScore: roundScore(combinedScore),
  };
}

async function resolveSubmittedSessionContexts(examId: string): Promise<SessionAnswerContext[]> {
  const sessions = await prisma.examSession.findMany({
    where: {
      examId,
      status: SessionStatus.submitted,
    },
    include: {
      candidate: {
        select: {
          candidateId: true,
          displayName: true,
        },
      },
      answers: {
        select: {
          questionId: true,
          selectedOption: true,
          savedAt: true,
        },
      },
    },
  });

  return sessions
    .filter((session) => session.candidate)
    .map((session) => ({
      sessionId: session.id,
      candidateId: session.candidate.candidateId,
      candidateName: session.candidate.displayName,
      answers: new Map(
        session.answers.map((answer) => [
          answer.questionId,
          {
            option: answer.selectedOption,
            savedAt: answer.savedAt.getTime(),
          },
        ]),
      ),
    }));
}

export async function runSimilarityDetection(
  payload: AdminSimilarityRunRequestBody,
  actor: AdminActor,
): Promise<SimilarityRunResult> {
  const examId = payload.examId?.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const answerWeight = parseNormalizedWeight(payload.answerWeight, 0.7);
  const timingWeight = parseNormalizedWeight(payload.timingWeight, 0.3);
  const scoreThreshold = parseNormalizedWeight(payload.scoreThreshold, 0.75);
  const minCommonAnswers = payload.minCommonAnswers ?? 3;

  if ([answerWeight, timingWeight, scoreThreshold].some((value) => Number.isNaN(value))) {
    return runtimeError(400, "INVALID_REQUEST", "answerWeight, timingWeight, and scoreThreshold must be between 0 and 1.");
  }

  if (!Number.isInteger(minCommonAnswers) || minCommonAnswers < 1 || minCommonAnswers > 100) {
    return runtimeError(400, "INVALID_REQUEST", "minCommonAnswers must be an integer between 1 and 100.");
  }

  const weightTotal = answerWeight + timingWeight;
  if (weightTotal <= 0) {
    return runtimeError(400, "INVALID_REQUEST", "answerWeight and timingWeight cannot both be zero.");
  }

  const normalizedAnswerWeight = answerWeight / weightTotal;
  const normalizedTimingWeight = timingWeight / weightTotal;

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    select: {
      id: true,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  const contexts = await resolveSubmittedSessionContexts(examId);
  if (contexts.length < 2) {
    return runtimeError(409, "INVALID_REQUEST", "At least two submitted candidates are required to run similarity.");
  }

  const pairs: Prisma.SimilarityPairCreateManyInput[] = [];

  for (let leftIndex = 0; leftIndex < contexts.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < contexts.length; rightIndex += 1) {
      const left = contexts[leftIndex];
      const right = contexts[rightIndex];
      const score = computePairScore(left, right, normalizedAnswerWeight, normalizedTimingWeight);

      if (score.commonAnswered < minCommonAnswers) {
        continue;
      }

      if (score.combinedScore < scoreThreshold) {
        continue;
      }

      pairs.push({
        runId: "",
        examId,
        leftSessionId: left.sessionId,
        rightSessionId: right.sessionId,
        leftCandidateId: left.candidateId,
        rightCandidateId: right.candidateId,
        leftCandidateName: left.candidateName,
        rightCandidateName: right.candidateName,
        commonAnswered: score.commonAnswered,
        matchingAnswers: score.matchingAnswers,
        answerSimilarity: score.answerSimilarity,
        timingSimilarity: score.timingSimilarity,
        combinedScore: score.combinedScore,
        flagged: true,
      });
    }
  }

  const run = await prisma.$transaction(async (tx) => {
    const createdRun = await tx.similarityRun.create({
      data: {
        examId,
        initiatedBy: `${actor.displayName} <${actor.email}>`,
        answerWeight: roundScore(normalizedAnswerWeight),
        timingWeight: roundScore(normalizedTimingWeight),
        scoreThreshold,
        minCommonAnswers,
        generatedPairs: pairs.length,
      },
    });

    if (pairs.length > 0) {
      await tx.similarityPair.createMany({
        data: pairs.map((pair) => ({
          ...pair,
          runId: createdRun.id,
        })),
      });
    }

    await tx.adminActionLog.create({
      data: {
        examId,
        actionType: "run_similarity",
        adminUserId: actor.id,
        adminIdentity: `${actor.displayName} <${actor.email}>`,
        metadata: {
          runId: createdRun.id,
          generatedPairs: pairs.length,
          scoreThreshold,
          minCommonAnswers,
        } satisfies Prisma.InputJsonObject,
      },
    });

    return createdRun;
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        runId: run.id,
        examId: run.examId,
        generatedPairs: run.generatedPairs,
        scoreThreshold: run.scoreThreshold,
        createdAt: run.createdAt.toISOString(),
      },
    },
  };
}

export async function getSimilaritySnapshot(request: AdminSimilarityListRequest): Promise<SimilarityListResult> {
  const examId = request.examId?.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const minScore = request.minScore ? Number(request.minScore) : undefined;
  if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 1)) {
    return runtimeError(400, "INVALID_REQUEST", "minScore must be a number between 0 and 1.");
  }

  const latestRun = await prisma.similarityRun.findFirst({
    where: {
      examId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!latestRun) {
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          run: null,
          pairs: [],
        },
      },
    };
  }

  const pairs = await prisma.similarityPair.findMany({
    where: {
      runId: latestRun.id,
      ...(minScore !== undefined
        ? {
            combinedScore: {
              gte: minScore,
            },
          }
        : {}),
    },
    orderBy: {
      combinedScore: "desc",
    },
    take: 100,
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        run: {
          runId: latestRun.id,
          examId: latestRun.examId,
          initiatedBy: latestRun.initiatedBy,
          answerWeight: latestRun.answerWeight,
          timingWeight: latestRun.timingWeight,
          scoreThreshold: latestRun.scoreThreshold,
          minCommonAnswers: latestRun.minCommonAnswers,
          generatedPairs: latestRun.generatedPairs,
          createdAt: latestRun.createdAt.toISOString(),
        },
        pairs: pairs.map((pair) => ({
          id: pair.id,
          leftCandidateId: pair.leftCandidateId,
          rightCandidateId: pair.rightCandidateId,
          leftCandidateName: pair.leftCandidateName,
          rightCandidateName: pair.rightCandidateName,
          commonAnswered: pair.commonAnswered,
          matchingAnswers: pair.matchingAnswers,
          answerSimilarity: pair.answerSimilarity,
          timingSimilarity: pair.timingSimilarity,
          combinedScore: pair.combinedScore,
          flagged: pair.flagged,
        })),
      },
    },
  };
}
