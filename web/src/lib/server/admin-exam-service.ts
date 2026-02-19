import { Prisma, SessionPolicy } from "@prisma/client";

import { normalizeCandidateId, normalizeSurname } from "@/lib/auth/candidate-identity";
import type {
  AdminExamCreateRequestBody,
  AdminExamCreateSuccessResponse,
  AdminExamListSuccessResponse,
  AdminExamSummary,
  AdminRosterUploadRequestBody,
  AdminRosterUploadSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import type { AdminActor } from "@/lib/server/admin-auth-service";
import { prisma } from "@/lib/server/prisma";

type AdminExamCreateResult =
  | {
      status: number;
      body: AdminExamCreateSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type AdminExamListResult =
  | {
      status: number;
      body: AdminExamListSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

type AdminRosterUploadResult =
  | {
      status: number;
      body: AdminRosterUploadSuccessResponse;
    }
  | {
      status: number;
      body: ExamRuntimeErrorResponse;
    };

interface ParsedRosterRow {
  candidateId: string;
  surnameNormalized: string;
  displayName: string;
}

interface ParsedRosterCsv {
  rows: ParsedRosterRow[];
  issues: Array<{ row: number; message: string }>;
  duplicateCount: number;
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

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeSessionPolicy(input: string | undefined): SessionPolicy {
  if (input === SessionPolicy.KickOld) {
    return SessionPolicy.KickOld;
  }

  return SessionPolicy.BlockNew;
}

function parseThreshold(input: number | undefined, fallback: number): number {
  if (typeof input !== "number") {
    return fallback;
  }

  if (!Number.isInteger(input) || input < 1 || input > 100) {
    return Number.NaN;
  }

  return input;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function isHeaderRow(cells: string[]): boolean {
  const normalized = cells.map((cell) => cell.trim().toLowerCase());
  return normalized.includes("candidateid") || normalized.includes("candidate_id") || normalized.includes("surname");
}

function parseRosterCsv(input: string): ParsedRosterCsv {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      rows: [],
      issues: [{ row: 1, message: "CSV is empty." }],
      duplicateCount: 0,
    };
  }

  const headerCells = parseCsvLine(lines[0]);
  const hasHeader = isHeaderRow(headerCells);

  const headerIndex = new Map<string, number>();
  if (hasHeader) {
    headerCells.forEach((cell, idx) => {
      headerIndex.set(cell.trim().toLowerCase(), idx);
    });
  }

  const start = hasHeader ? 1 : 0;
  const issues: Array<{ row: number; message: string }> = [];
  const byCandidate = new Map<string, ParsedRosterRow>();
  let duplicateCount = 0;

  for (let rowIndex = start; rowIndex < lines.length; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const cells = parseCsvLine(lines[rowIndex]);

    const candidateIdValue = hasHeader
      ? cells[
          headerIndex.get("candidateid") ?? headerIndex.get("candidate_id") ?? headerIndex.get("candidate id") ?? 0
        ]
      : cells[0];
    const surnameValue = hasHeader ? cells[headerIndex.get("surname") ?? 1] : cells[1];
    const displayNameValue = hasHeader
      ? cells[headerIndex.get("displayname") ?? headerIndex.get("display_name") ?? headerIndex.get("display name") ?? 2]
      : cells[2];

    if (!candidateIdValue || !surnameValue) {
      issues.push({ row: rowNumber, message: "candidateId and surname are required." });
      continue;
    }

    const candidateId = normalizeCandidateId(candidateIdValue);
    const surnameNormalized = normalizeSurname(surnameValue);
    const displayName = displayNameValue?.trim() || `${candidateId} ${surnameValue.trim()}`;

    if (byCandidate.has(candidateId)) {
      duplicateCount += 1;
    }

    byCandidate.set(candidateId, {
      candidateId,
      surnameNormalized,
      displayName,
    });
  }

  return {
    rows: Array.from(byCandidate.values()),
    issues,
    duplicateCount,
  };
}

function toExamSummary(input: {
  id: string;
  accessCode: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  sessionPolicy: SessionPolicy;
  warningThreshold: number;
  temporaryLockThreshold: number;
  autoSubmitThreshold: number;
  createdAt: Date;
  _count: {
    candidates: number;
    questions: number;
  };
}): AdminExamSummary {
  return {
    examId: input.id,
    accessCode: input.accessCode,
    title: input.title,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    sessionPolicy: input.sessionPolicy,
    warningThreshold: input.warningThreshold,
    temporaryLockThreshold: input.temporaryLockThreshold,
    autoSubmitThreshold: input.autoSubmitThreshold,
    candidateCount: input._count.candidates,
    questionCount: input._count.questions,
    createdAt: input.createdAt.toISOString(),
  };
}

export async function listAdminExams(): Promise<AdminExamListResult> {
  const exams = await prisma.exam.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 25,
    include: {
      _count: {
        select: {
          candidates: true,
          questions: true,
        },
      },
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        exams: exams.map((exam) => toExamSummary(exam)),
      },
    },
  };
}

export async function createAdminExam(
  payload: AdminExamCreateRequestBody,
  actor: AdminActor,
): Promise<AdminExamCreateResult> {
  const accessCode = payload.accessCode?.trim().toUpperCase();
  const title = payload.title?.trim();
  const startsAt = parseIsoDate(payload.startsAt);
  const endsAt = parseIsoDate(payload.endsAt);

  if (!accessCode || !title || !startsAt || !endsAt) {
    return runtimeError(400, "INVALID_REQUEST", "accessCode, title, startsAt, and endsAt are required.");
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return runtimeError(400, "INVALID_REQUEST", "endsAt must be later than startsAt.");
  }

  const warningThreshold = parseThreshold(payload.warningThreshold, 3);
  const temporaryLockThreshold = parseThreshold(payload.temporaryLockThreshold, 5);
  const autoSubmitThreshold = parseThreshold(payload.autoSubmitThreshold, 8);

  if ([warningThreshold, temporaryLockThreshold, autoSubmitThreshold].some((value) => Number.isNaN(value))) {
    return runtimeError(400, "INVALID_REQUEST", "Strike thresholds must be integers between 1 and 100.");
  }

  if (!(warningThreshold < temporaryLockThreshold && temporaryLockThreshold < autoSubmitThreshold)) {
    return runtimeError(
      400,
      "INVALID_REQUEST",
      "Strike thresholds must satisfy warning < temporaryLock < autoSubmit.",
    );
  }

  const questions = payload.questions ?? [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const prompt = question.prompt?.trim();
    const options = (question.options ?? []).map((option) => option.trim()).filter((option) => option.length > 0);
    const uniqueOptions = new Set(options);
    const correctOption = question.correctOption?.trim();

    if (!prompt || options.length < 2 || uniqueOptions.size < 2 || !correctOption || !uniqueOptions.has(correctOption)) {
      return runtimeError(400, "INVALID_REQUEST", `Question ${index + 1} is invalid.`);
    }
  }

  try {
    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          accessCode,
          title,
          startsAt,
          endsAt,
          sessionPolicy: normalizeSessionPolicy(payload.sessionPolicy),
          warningThreshold,
          temporaryLockThreshold,
          autoSubmitThreshold,
        },
      });

      if (questions.length > 0) {
        await tx.question.createMany({
          data: questions.map((question) => ({
            examId: created.id,
            prompt: question.prompt.trim(),
            options: question.options.map((option) => option.trim()) as Prisma.InputJsonValue,
            correctOption: question.correctOption.trim(),
          })),
        });
      }

      await tx.adminActionLog.create({
        data: {
          examId: created.id,
          actionType: "create_exam",
          adminUserId: actor.id,
          adminIdentity: `${actor.displayName} <${actor.email}>`,
          metadata: {
            accessCode,
            questionCount: questions.length,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return tx.exam.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        include: {
          _count: {
            select: {
              candidates: true,
              questions: true,
            },
          },
        },
      });
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          exam: toExamSummary(exam),
        },
      },
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return runtimeError(409, "INVALID_REQUEST", "Exam access code already exists.");
    }

    throw error;
  }
}

export async function uploadExamRosterCsv(
  examIdInput: string,
  payload: AdminRosterUploadRequestBody,
  actor: AdminActor,
): Promise<AdminRosterUploadResult> {
  const examId = examIdInput.trim();
  const csv = payload.csv?.trim();
  if (!examId || !csv) {
    return runtimeError(400, "INVALID_REQUEST", "examId and csv are required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (Date.now() >= exam.startsAt.getTime()) {
    return runtimeError(409, "SUBMISSION_NOT_ALLOWED", "Roster can only be edited before exam start.");
  }

  const parsed = parseRosterCsv(csv);
  if (parsed.rows.length === 0) {
    return runtimeError(400, "INVALID_REQUEST", "Roster CSV did not contain valid candidate rows.");
  }

  let createdCount = 0;
  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const existing = await tx.candidate.findUnique({
        where: {
          examId_candidateId: {
            examId,
            candidateId: row.candidateId,
          },
        },
      });

      if (existing) {
        await tx.candidate.update({
          where: {
            id: existing.id,
          },
          data: {
            surnameNormalized: row.surnameNormalized,
            displayName: row.displayName,
          },
        });
        updatedCount += 1;
      } else {
        await tx.candidate.create({
          data: {
            examId,
            candidateId: row.candidateId,
            surnameNormalized: row.surnameNormalized,
            displayName: row.displayName,
          },
        });
        createdCount += 1;
      }
    }

    await tx.adminActionLog.create({
      data: {
        examId,
        actionType: "upload_roster",
        adminUserId: actor.id,
        adminIdentity: `${actor.displayName} <${actor.email}>`,
        metadata: {
          createdCount,
          updatedCount,
          issueCount: parsed.issues.length,
          duplicateCount: parsed.duplicateCount,
        } satisfies Prisma.InputJsonObject,
      },
    });
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId,
        createdCount,
        updatedCount,
        skippedCount: parsed.duplicateCount,
        totalProcessed: parsed.rows.length,
        issues: parsed.issues,
      },
    },
  };
}
