import { createHash, randomBytes, randomUUID } from "node:crypto";

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
import { getRedisClient } from "@/lib/server/redis";

const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const SESSION_TTL_SECONDS = 15 * 60;

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

function tokenHash(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function sessionToken(): string {
  return `${randomUUID()}${randomBytes(16).toString("hex")}`;
}

function activeSessionKey(examId: string, candidateRecordId: string): string {
  return `auth:active:${examId}:${candidateRecordId}`;
}

function sessionTokenKey(tokenDigest: string): string {
  return `auth:token:${tokenDigest}`;
}

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

async function checkRateLimit(key: string): Promise<{ blocked: boolean; retryAfterSeconds?: number }> {
  const redis = await getRedisClient();

  if (redis) {
    const count = Number(await redis.get(key)) || 0;
    if (count < MAX_FAILED_LOGIN_ATTEMPTS) {
      return { blocked: false };
    }

    const ttl = await redis.ttl(key);
    return {
      blocked: true,
      retryAfterSeconds: ttl > 0 ? ttl : FAILED_LOGIN_WINDOW_SECONDS,
    };
  }

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

async function recordFailedLogin(key: string): Promise<void> {
  const redis = await getRedisClient();

  if (redis) {
    const next = await redis.incr(key);
    if (next === 1) {
      await redis.expire(key, FAILED_LOGIN_WINDOW_SECONDS);
    }
    return;
  }

  const now = Date.now();
  const state = readMemoryLimiterState(key, now);
  state.timestamps.push(now);
}

async function clearFailedLogins(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }

  inMemoryRateLimit.delete(key);
}

async function setSessionKeys(
  examId: string,
  candidateRecordId: string,
  tokenDigest: string,
  sessionId: string,
  ttlSeconds: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.set(activeSessionKey(examId, candidateRecordId), sessionId, {
    EX: ttlSeconds,
  });

  await redis.set(sessionTokenKey(tokenDigest), sessionId, {
    EX: ttlSeconds,
  });
}

async function clearSessionKeys(examId: string, candidateRecordId: string, tokenDigest: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) {
    return;
  }

  await redis.del([activeSessionKey(examId, candidateRecordId), sessionTokenKey(tokenDigest)]);
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
  const redis = await getRedisClient();

  if (redis) {
    const cachedSessionId = await redis.get(activeSessionKey(examId, candidateRecordId));
    if (cachedSessionId) {
      const session = await prisma.examSession.findUnique({
        where: { id: cachedSessionId },
      });

      if (session) {
        return session;
      }
    }
  }

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

  if (!session) {
    return null;
  }

  const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000));
  await setSessionKeys(examId, candidateRecordId, session.tokenHash, session.id, ttlSeconds);
  return session;
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
  const rateLimit = await checkRateLimit(limiterKey);
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
    await recordFailedLogin(limiterKey);
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

    await clearSessionKeys(activeSession.examId, activeSession.candidateRecordId, activeSession.tokenHash);
  }

  await clearFailedLogins(limiterKey);

  const rawToken = sessionToken();
  const tokenDigest = tokenHash(rawToken);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

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

  await setSessionKeys(exam.id, candidate.id, tokenDigest, session.id, SESSION_TTL_SECONDS);

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

async function resolveSessionByToken(tokenDigest: string) {
  const redis = await getRedisClient();

  if (redis) {
    const cachedSessionId = await redis.get(sessionTokenKey(tokenDigest));
    if (cachedSessionId) {
      const session = await prisma.examSession.findUnique({
        where: { id: cachedSessionId },
      });

      if (session && session.tokenHash === tokenDigest) {
        return session;
      }
    }
  }

  return prisma.examSession.findUnique({
    where: {
      tokenHash: tokenDigest,
    },
  });
}

export async function validateSession(
  payload: CandidateSessionValidationRequestBody,
): Promise<SessionValidationServiceResult> {
  const rawSessionToken = payload.sessionToken?.trim();
  const examId = payload.examId?.trim();

  if (!rawSessionToken || !examId) {
    return buildAuthError(400, "INVALID_REQUEST", "sessionToken and examId are required.");
  }

  const tokenDigest = tokenHash(rawSessionToken);
  const session = await resolveSessionByToken(tokenDigest);
  if (!session || session.examId !== examId) {
    return buildAuthError(401, "SESSION_NOT_FOUND", "Session is not valid.");
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    await prisma.examSession.update({
      where: { id: session.id },
      data: {
        status: SessionStatus.expired,
      },
    });

    await clearSessionKeys(session.examId, session.candidateRecordId, session.tokenHash);
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
    where: {
      id: session.candidateRecordId,
    },
  });

  if (!candidate) {
    return buildAuthError(401, "SESSION_NOT_FOUND", "Session cannot be resolved.");
  }

  await prisma.examSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
    },
  });

  const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000));
  await setSessionKeys(session.examId, session.candidateRecordId, session.tokenHash, session.id, ttlSeconds);

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

export async function getSeededAuthReference(): Promise<{
  examId: string;
  examAccessCode: string;
  demoCandidates: Array<{ candidateId: string; surname: string }>;
}> {
  const exam = await prisma.exam.findUnique({
    where: { id: "exam-mth101" },
    include: {
      candidates: {
        orderBy: {
          candidateId: "asc",
        },
      },
    },
  });

  if (!exam) {
    return {
      examId: "",
      examAccessCode: "",
      demoCandidates: [],
    };
  }

  return {
    examId: exam.id,
    examAccessCode: exam.accessCode,
    demoCandidates: exam.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      surname: candidate.surnameNormalized,
    })),
  };
}
