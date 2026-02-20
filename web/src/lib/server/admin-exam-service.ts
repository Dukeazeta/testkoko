import { Prisma, SessionPolicy, SessionStatus, SubmissionMode } from "@prisma/client";

import { normalizeCandidateId, normalizeSurname } from "@/lib/auth/candidate-identity";
import type {
  AdminExamCreateRequestBody,
  AdminExamCreateSuccessResponse,
  AdminExamDetailSuccessResponse,
  AdminExamLifecycleRequestBody,
  AdminExamLifecycleSuccessResponse,
  AdminExamListSuccessResponse,
  AdminExamQuestionsUpdateRequestBody,
  AdminExamQuestionsUpdateSuccessResponse,
  AdminExamSummary,
  AdminExamStudentsUpdateRequestBody,
  AdminExamStudentsUpdateSuccessResponse,
  AdminExamUpdateRequestBody,
  AdminExamUpdateSuccessResponse,
  AdminRosterUploadRequestBody,
  AdminRosterUploadSuccessResponse,
  ExamRuntimeErrorResponse,
} from "@/lib/exam/contracts";
import { finalizeSubmissionBySessionId, type FinalizeSubmissionResult } from "@/lib/server/exam-runtime-service";
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

type AdminExamDetailResult =
  | {
    status: number;
    body: AdminExamDetailSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type AdminExamUpdateResult =
  | {
    status: number;
    body: AdminExamUpdateSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type AdminExamQuestionsUpdateResult =
  | {
    status: number;
    body: AdminExamQuestionsUpdateSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type AdminExamStudentsUpdateResult =
  | {
    status: number;
    body: AdminExamStudentsUpdateSuccessResponse;
  }
  | {
    status: number;
    body: ExamRuntimeErrorResponse;
  };

type AdminExamLifecycleResult =
  | {
    status: number;
    body: AdminExamLifecycleSuccessResponse;
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

function normalizeQuestions(
  questions: Array<{ prompt: string; options: string[]; correctOption: string }> | undefined,
):
  | { ok: true; value: Array<{ prompt: string; options: string[]; correctOption: string }> }
  | { ok: false; message: string } {
  const source = questions ?? [];
  const normalizedQuestions: Array<{ prompt: string; options: string[]; correctOption: string }> = [];

  for (let index = 0; index < source.length; index += 1) {
    const question = source[index];
    const prompt = question.prompt?.trim();
    const options = (question.options ?? []).map((option) => option.trim()).filter((option) => option.length > 0);
    const uniqueOptions = new Set(options.map((option) => option.toLowerCase()));
    const correctOption = question.correctOption?.trim();

    if (!prompt) {
      return { ok: false, message: `Question ${index + 1} is invalid: prompt is required.` };
    }

    if (options.length < 2) {
      return { ok: false, message: `Question ${index + 1} is invalid: at least 2 options are required.` };
    }

    if (uniqueOptions.size < 2) {
      return { ok: false, message: `Question ${index + 1} is invalid: options must not all be duplicates.` };
    }

    if (!correctOption) {
      return { ok: false, message: `Question ${index + 1} is invalid: select a correct option.` };
    }

    if (!options.includes(correctOption)) {
      return {
        ok: false,
        message: `Question ${index + 1} is invalid: correct option must match one option exactly.`,
      };
    }

    normalizedQuestions.push({
      prompt,
      options,
      correctOption,
    });
  }

  return { ok: true, value: normalizedQuestions };
}

function canEditExamContent(examStartsAt: Date): boolean {
  return Date.now() < examStartsAt.getTime();
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

export async function listLecturerExams(lecturerId: string): Promise<AdminExamListResult> {
  const exams = await prisma.exam.findMany({
    where: { lecturerId },
    orderBy: { createdAt: "desc" },
    take: 50,
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

export async function createExam(
  payload: AdminExamCreateRequestBody,
  lecturerId: string,
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

  const normalizedQuestionsResult = normalizeQuestions(payload.questions);
  if (!normalizedQuestionsResult.ok) {
    return runtimeError(400, "INVALID_REQUEST", normalizedQuestionsResult.message);
  }

  const normalizedQuestions = normalizedQuestionsResult.value;

  try {
    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          accessCode,
          title,
          startsAt,
          endsAt,
          lecturerId,
          sessionPolicy: normalizeSessionPolicy(payload.sessionPolicy),
          warningThreshold,
          temporaryLockThreshold,
          autoSubmitThreshold,
        },
      });

      if (normalizedQuestions.length > 0) {
        await tx.question.createMany({
          data: normalizedQuestions.map((question) => ({
            examId: created.id,
            prompt: question.prompt,
            options: question.options as Prisma.InputJsonValue,
            correctOption: question.correctOption,
          })),
        });
      }

      return tx.exam.findUniqueOrThrow({
        where: { id: created.id },
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

async function loadExamSummaryById(examId: string) {
  return prisma.exam.findUnique({
    where: {
      id: examId,
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
}

export async function updateExamLifecycle(
  examIdInput: string,
  payload: AdminExamLifecycleRequestBody,
  lecturerId: string,
): Promise<AdminExamLifecycleResult> {
  const examId = examIdInput.trim();
  const action = payload.action;

  if (!examId || (action !== "start" && action !== "end")) {
    return runtimeError(400, "INVALID_REQUEST", "examId and a valid action (start or end) are required.");
  }

  const now = new Date();
  const exam = await loadExamSummaryById(examId);

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
  }

  if (action === "start") {
    if (exam.endsAt.getTime() <= now.getTime()) {
      return runtimeError(409, "INVALID_REQUEST", "Exam has already ended and cannot be started.");
    }

    if (exam.startsAt.getTime() <= now.getTime()) {
      return runtimeError(409, "INVALID_REQUEST", "Exam has already started.");
    }

    const updated = await prisma.exam.update({
      where: {
        id: examId,
      },
      data: {
        startsAt: now,
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

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          action,
          autoSubmittedCount: 0,
          exam: toExamSummary(updated),
        },
      },
    };
  }

  if (exam.endsAt.getTime() <= now.getTime()) {
    return runtimeError(409, "INVALID_REQUEST", "Exam has already ended.");
  }

  const activeSessions = await prisma.examSession.findMany({
    where: {
      examId,
      status: SessionStatus.active,
    },
    select: {
      id: true,
    },
  });

  const updated = await prisma.exam.update({
    where: {
      id: examId,
    },
    data: {
      endsAt: now,
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

  const outcomes: FinalizeSubmissionResult[] = [];
  for (const session of activeSessions) {
    const outcome = await finalizeSubmissionBySessionId(session.id, SubmissionMode.timeout);
    outcomes.push(outcome);
  }

  const autoSubmittedCount = outcomes.reduce((count, outcome) => {
    if (!outcome.blocked && outcome.submission && !outcome.alreadySubmitted) {
      return count + 1;
    }

    return count;
  }, 0);

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        action,
        autoSubmittedCount,
        exam: toExamSummary(updated),
      },
    },
  };
}

export async function getExamDetail(
  examIdInput: string,
  lecturerId: string,
): Promise<AdminExamDetailResult> {
  const examId = examIdInput.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    include: {
      _count: {
        select: {
          candidates: true,
          questions: true,
        },
      },
      questions: {
        orderBy: {
          createdAt: "asc",
        },
      },
      candidates: {
        orderBy: {
          candidateId: "asc",
        },
      },
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
  }

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        exam: toExamSummary(exam),
        questions: exam.questions.map((question) => ({
          questionId: question.id,
          prompt: question.prompt,
          options: Array.isArray(question.options)
            ? question.options.filter((value): value is string => typeof value === "string")
            : [],
          correctOption: question.correctOption,
        })),
        students: exam.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          surname: candidate.surnameNormalized,
          displayName: candidate.displayName,
        })),
      },
    },
  };
}

export async function updateExamDetails(
  examIdInput: string,
  payload: AdminExamUpdateRequestBody,
  lecturerId: string,
): Promise<AdminExamUpdateResult> {
  const examId = examIdInput.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await loadExamSummaryById(examId);
  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
  }

  if (!canEditExamContent(exam.startsAt)) {
    return runtimeError(409, "INVALID_REQUEST", "Exam details can only be edited before the exam starts.");
  }

  const title = payload.title === undefined ? exam.title : payload.title.trim();
  const accessCode = payload.accessCode === undefined ? exam.accessCode : payload.accessCode.trim().toUpperCase();
  const startsAt = payload.startsAt === undefined ? exam.startsAt : parseIsoDate(payload.startsAt);
  const endsAt = payload.endsAt === undefined ? exam.endsAt : parseIsoDate(payload.endsAt);

  if (!title || !accessCode || !startsAt || !endsAt) {
    return runtimeError(400, "INVALID_REQUEST", "title, accessCode, startsAt, and endsAt must be valid.");
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return runtimeError(400, "INVALID_REQUEST", "endsAt must be later than startsAt.");
  }

  try {
    const updated = await prisma.exam.update({
      where: {
        id: examId,
      },
      data: {
        title,
        accessCode,
        startsAt,
        endsAt,
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

    return {
      status: 200,
      body: {
        ok: true,
        data: {
          exam: toExamSummary(updated),
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

export async function replaceExamQuestions(
  examIdInput: string,
  payload: AdminExamQuestionsUpdateRequestBody,
  lecturerId: string,
): Promise<AdminExamQuestionsUpdateResult> {
  const examId = examIdInput.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    select: {
      id: true,
      lecturerId: true,
      startsAt: true,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
  }

  if (!canEditExamContent(exam.startsAt)) {
    return runtimeError(409, "INVALID_REQUEST", "Questions can only be edited before the exam starts.");
  }

  const normalizedQuestionsResult = normalizeQuestions(payload.questions);
  if (!normalizedQuestionsResult.ok) {
    return runtimeError(400, "INVALID_REQUEST", normalizedQuestionsResult.message);
  }

  const questions = normalizedQuestionsResult.value;

  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({
      where: {
        examId,
      },
    });

    if (questions.length > 0) {
      await tx.question.createMany({
        data: questions.map((question) => ({
          examId,
          prompt: question.prompt,
          options: question.options as Prisma.InputJsonValue,
          correctOption: question.correctOption,
        })),
      });
    }
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId,
        questionCount: questions.length,
      },
    },
  };
}

export async function replaceExamStudents(
  examIdInput: string,
  payload: AdminExamStudentsUpdateRequestBody,
  lecturerId: string,
): Promise<AdminExamStudentsUpdateResult> {
  const examId = examIdInput.trim();
  if (!examId) {
    return runtimeError(400, "INVALID_REQUEST", "examId is required.");
  }

  const exam = await prisma.exam.findUnique({
    where: {
      id: examId,
    },
    select: {
      id: true,
      lecturerId: true,
      startsAt: true,
    },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
  }

  if (!canEditExamContent(exam.startsAt)) {
    return runtimeError(409, "INVALID_REQUEST", "Students can only be edited before the exam starts.");
  }

  const source = payload.students ?? [];
  const byCandidateId = new Map<string, { candidateId: string; surnameNormalized: string; displayName: string }>();

  for (let index = 0; index < source.length; index += 1) {
    const student = source[index];
    const candidateIdRaw = student.candidateId?.trim();
    const surnameRaw = student.surname?.trim();

    if (!candidateIdRaw || !surnameRaw) {
      return runtimeError(400, "INVALID_REQUEST", `Student ${index + 1} is invalid: candidateId and surname are required.`);
    }

    const candidateId = normalizeCandidateId(candidateIdRaw);
    const surnameNormalized = normalizeSurname(surnameRaw);
    const displayName = student.displayName?.trim() || `${candidateId} ${surnameRaw}`;

    byCandidateId.set(candidateId, {
      candidateId,
      surnameNormalized,
      displayName,
    });
  }

  const normalizedStudents = Array.from(byCandidateId.values());

  await prisma.$transaction(async (tx) => {
    await tx.candidate.deleteMany({
      where: {
        examId,
      },
    });

    if (normalizedStudents.length > 0) {
      await tx.candidate.createMany({
        data: normalizedStudents.map((student) => ({
          examId,
          candidateId: student.candidateId,
          surnameNormalized: student.surnameNormalized,
          displayName: student.displayName,
        })),
      });
    }
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        examId,
        studentCount: normalizedStudents.length,
      },
    },
  };
}

export async function uploadExamRosterCsv(
  examIdInput: string,
  payload: AdminRosterUploadRequestBody,
  lecturerId: string,
): Promise<AdminRosterUploadResult> {
  const examId = examIdInput.trim();
  const csv = payload.csv?.trim();
  if (!examId || !csv) {
    return runtimeError(400, "INVALID_REQUEST", "examId and csv are required.");
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
  });

  if (!exam) {
    return runtimeError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  if (exam.lecturerId !== lecturerId) {
    return runtimeError(403, "FORBIDDEN", "You do not own this exam.");
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
          where: { id: existing.id },
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

export async function exportExamResults(examId: string, lecturerId: string): Promise<string> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      submissions: {
        include: {
          candidate: true,
        },
        orderBy: { submittedAt: "asc" },
      },
      candidates: true,
    },
  });

  if (!exam || exam.lecturerId !== lecturerId) {
    return "";
  }

  const lines = ["Matric Number,Name,Score (%),Correct Answers,Total Questions,Submitted At,Strikes"];

  const submissionMap = new Map(exam.submissions.map((sub) => [sub.candidateRecordId, sub]));

  for (const candidate of exam.candidates) {
    const sub = submissionMap.get(candidate.id);

    const strikeState = await prisma.strikeState.findFirst({
      where: {
        examId: exam.id,
        candidateRecordId: candidate.id,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (sub) {
      lines.push(
        [
          candidate.candidateId,
          `"${candidate.displayName}"`,
          sub.scorePercent.toFixed(1),
          sub.correctAnswers,
          sub.totalQuestions,
          sub.submittedAt.toISOString(),
          strikeState?.totalStrikes ?? 0,
        ].join(","),
      );
    } else {
      lines.push(
        [
          candidate.candidateId,
          `"${candidate.displayName}"`,
          "N/A",
          "N/A",
          "N/A",
          "Not Submitted",
          strikeState?.totalStrikes ?? 0,
        ].join(","),
      );
    }
  }

  return lines.join("\n");
}
