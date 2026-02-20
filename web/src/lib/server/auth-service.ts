import { SessionStatus } from "@prisma/client";

import type {
  AuthErrorResponse,
  CandidateLoginRequestBody,
  CandidateLoginSuccessResponse,
  CandidateSessionValidationRequestBody,
  CandidateSessionValidationSuccessResponse,
} from "@/lib/auth/contracts";
import {
  isValidCredentialShape,
  normalizeCandidateId,
  normalizeSurname,
} from "@/lib/auth/candidate-identity";
import { evaluateSessionPolicy } from "@/lib/exam/session-policy";
import { prisma } from "@/lib/server/prisma";
import { hashToken, randomToken } from "@/lib/server/security";

const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const SESSION_MAX_TTL_SECONDS = 12 * 60 * 60;

interface RequestContext {
  clientIp: string;
  userAgent: string;
}

interface InMemoryRateLimitRecord {
  timestamps: number[];
}

type LoginServiceResult =
  | {
    status: 200;
    body: CandidateLoginSuccessResponse;
  }
  | {
    status: number;
    body: AuthErrorResponse;
  };

type SessionValidationServiceResult =
  | {
    status: 200;
    body: CandidateSessionValidationSuccessResponse;
  }
  | {
    status: number;
    body: AuthErrorResponse;
  };

const inMemoryRateLimit = new Map<string, InMemoryRateLimitRecord>();

function loginRateLimitKey(examId: string, normalizedCandidateId: string, clientIp: string): string {
  return `auth:failed:${examId}:${normalizedCandidateId}:${clientIp}`;
}

function buildAuthError(
  status: number,
  code: AuthErrorResponse["error"]["code"],
  message: string,
  retryAfterSeconds?: number,
): { status: number; body: AuthErrorResponse } {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        retryAfterSeconds,
      },
    },
  };
}

function readMemoryLimiterState(key: string, now: number): InMemoryRateLimitRecord {
  const existing = inMemoryRateLimit.get(key);
  if (!existing) {
    const fresh = { timestamps: [] };
    inMemoryRateLimit.set(key, fresh);
    return fresh;
  }

  const floor = now - FAILED_LOGIN_WINDOW_SECONDS * 1000;
  existing.timestamps = existing.timestamps.filter((stamp) => stamp >= floor);
  return existing;
}

function checkRateLimit(key: string): { blocked: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const state = readMemoryLimiterState(key, now);
  if (state.timestamps.length < MAX_FAILED_LOGIN_ATTEMPTS) {
    return { blocked: false };
  }

  const oldest = state.timestamps[0];
  const retryAfterMs = FAILED_LOGIN_WINDOW_SECONDS * 1000 - (now - oldest);
  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

function recordFailedLogin(key: string): void {
  const now = Date.now();
  const state = readMemoryLimiterState(key, now);
  state.timestamps.push(now);
}

function clearFailedLogins(key: string): void {
  inMemoryRateLimit.delete(key);
}

async function findExam(payload: CandidateLoginRequestBody) {
  if (payload.examId) {
    return prisma.exam.findUnique({
      where: { id: payload.examId.trim() },
    });
  }

  if (!payload.examAccessCode) {
    return null;
  }

  return prisma.exam.findUnique({
    where: {
      accessCode: payload.examAccessCode.trim().toUpperCase(),
    },
  });
}

async function readActiveSession(examId: string, candidateRecordId: string) {
  const now = new Date();

  const session = await prisma.examSession.findFirst({
    where: {
      examId,
      candidateRecordId,
      status: SessionStatus.active,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return session ?? null;
}

export async function loginCandidate(
  payload: CandidateLoginRequestBody,
  context: RequestContext,
): Promise<LoginServiceResult> {
  const candidateIdInput = payload.candidateId ?? "";
  const surnameInput = payload.surname ?? "";

  if (!payload.examId && !payload.examAccessCode) {
    return buildAuthError(400, "INVALID_REQUEST", "examId or examAccessCode is required.");
  }

  if (!isValidCredentialShape(candidateIdInput, surnameInput)) {
    return buildAuthError(400, "INVALID_REQUEST", "candidateId and surname are required.");
  }

  const exam = await findExam(payload);
  if (!exam) {
    return buildAuthError(404, "EXAM_NOT_FOUND", "Exam does not exist.");
  }

  const normalizedCandidateId = normalizeCandidateId(candidateIdInput);
  const normalizedSurname = normalizeSurname(surnameInput);

  const limiterKey = loginRateLimitKey(exam.id, normalizedCandidateId, context.clientIp);
  const rateLimit = checkRateLimit(limiterKey);
  if (rateLimit.blocked) {
    return buildAuthError(
      429,
      "RATE_LIMITED",
      "Too many failed attempts. Try again later.",
      rateLimit.retryAfterSeconds,
    );
  }

  const now = new Date();
  if (now < exam.startsAt || now > exam.endsAt) {
    return buildAuthError(403, "EXAM_CLOSED", "Exam is outside the allowed sign-in window.");
  }

  const candidate = await prisma.candidate.findUnique({
    where: {
      examId_candidateId: {
        examId: exam.id,
        candidateId: normalizedCandidateId,
      },
    },
  });

  if (!candidate || candidate.surnameNormalized !== normalizedSurname) {
    recordFailedLogin(limiterKey);
    return buildAuthError(401, "INVALID_CREDENTIALS", "Invalid sign-in details.");
  }

  const activeSession = await readActiveSession(exam.id, candidate.id);
  const policyDecision = evaluateSessionPolicy({
    hasActiveSession: Boolean(activeSession),
    policy: exam.sessionPolicy,
  });

  if (!policyDecision.allowNewSession) {
    return buildAuthError(409, "ACTIVE_SESSION_EXISTS", "An active session already exists for this candidate.");
  }

  if (activeSession && policyDecision.revokeOldSession) {
    await prisma.examSession.update({
      where: { id: activeSession.id },
      data: {
        status: SessionStatus.revoked,
        revokedAt: now,
      },
    });
  }

  clearFailedLogins(limiterKey);

  const rawToken = randomToken();
  const tokenDigest = hashToken(rawToken);
  const examRemainingSeconds = Math.max(60, Math.floor((exam.endsAt.getTime() - now.getTime()) / 1000));
  const ttlSeconds = Math.min(SESSION_MAX_TTL_SECONDS, examRemainingSeconds);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const session = await prisma.examSession.create({
    data: {
      examId: exam.id,
      candidateRecordId: candidate.id,
      tokenHash: tokenDigest,
      status: SessionStatus.active,
      expiresAt,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId: session.id,
        sessionToken: rawToken,
        examId: exam.id,
        candidateId: candidate.candidateId,
        candidateName: candidate.displayName,
        expiresAt: session.expiresAt.toISOString(),
        sessionPolicy: exam.sessionPolicy,
      },
    },
  };
}

export async function validateSession(
  payload: CandidateSessionValidationRequestBody,
): Promise<SessionValidationServiceResult> {
  const rawSessionToken = payload.sessionToken?.trim();
  const examId = payload.examId?.trim();

  if (!rawSessionToken || !examId) {
    return buildAuthError(400, "INVALID_REQUEST", "sessionToken and examId are required.");
  }

  const tokenDigest = hashToken(rawSessionToken);
  const session = await prisma.examSession.findUnique({
    where: { tokenHash: tokenDigest },
  });

  if (!session || session.examId !== examId) {
    return buildAuthError(401, "SESSION_NOT_FOUND", "Session is not valid.");
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    await prisma.examSession.update({
      where: { id: session.id },
      data: { status: SessionStatus.expired },
    });
    return buildAuthError(401, "SESSION_EXPIRED", "Session has expired. Sign in again.");
  }

  if (session.status !== SessionStatus.active) {
    return buildAuthError(401, "SESSION_REVOKED", "Session is no longer active.");
  }

  const activeSession = await readActiveSession(session.examId, session.candidateRecordId);
  if (!activeSession || activeSession.id !== session.id) {
    return buildAuthError(401, "SESSION_REVOKED", "Session is no longer active.");
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: session.candidateRecordId },
  });

  if (!candidate) {
    return buildAuthError(401, "SESSION_NOT_FOUND", "Session cannot be resolved.");
  }

  await prisma.examSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now },
  });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        sessionId: session.id,
        examId: session.examId,
        candidateId: candidate.candidateId,
        candidateName: candidate.displayName,
        expiresAt: session.expiresAt.toISOString(),
      },
    },
  };
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "unknown";
}
