import { SubmissionMode } from "@prisma/client";
import { describe, expect, test, beforeEach, afterAll } from "vitest";

import { closeSeedResources, seedDatabase } from "../../prisma/seed";
import { loginCandidate, validateSession } from "../../src/lib/server/auth-service";
import { getExamRuntime, autosaveExamAnswer, finalizeSubmissionBySessionId, submitExam } from "../../src/lib/server/exam-runtime-service";
import { ingestExamEvent } from "../../src/lib/server/exam-monitoring-service";
import { updateExamLifecycle } from "../../src/lib/server/admin-exam-service";
import { prisma } from "../../src/lib/server/prisma";


describe("Reliability integration flows", () => {
  beforeEach(async () => {
    await seedDatabase({ reset: true });
  });

  afterAll(async () => {

    await prisma.$disconnect();
    await closeSeedResources();
  });

  test("login creates a valid session", async () => {
    const login = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(login.status).toBe(200);
    expect(login.body.ok).toBe(true);
    if (!login.body.ok) {
      return;
    }

    const validate = await validateSession({
      examId: login.body.data.examId,
      sessionToken: login.body.data.sessionToken,
    });

    expect(validate.status).toBe(200);
    expect(validate.body.ok).toBe(true);
  });

  test("manual start opens exam before scheduled time", async () => {
    const exam = await prisma.exam.findUnique({
      where: {
        accessCode: "MTH101-FEB26",
      },
      select: {
        id: true,
        lecturerId: true,
      },
    });

    expect(exam).not.toBeNull();
    if (!exam) {
      return;
    }

    const now = Date.now();
    await prisma.exam.update({
      where: {
        id: exam.id,
      },
      data: {
        startsAt: new Date(now + 30 * 60 * 1000),
        endsAt: new Date(now + 2 * 60 * 60 * 1000),
      },
    });

    const blockedLogin = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(blockedLogin.status).toBe(403);
    if (!blockedLogin.body.ok) {
      expect(blockedLogin.body.error.code).toBe("EXAM_CLOSED");
    }

    const started = await updateExamLifecycle(exam.id, { action: "start" }, exam.lecturerId);
    expect(started.status).toBe(200);
    expect(started.body.ok).toBe(true);

    const allowedLogin = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(allowedLogin.status).toBe(200);
    expect(allowedLogin.body.ok).toBe(true);
  });

  test("manual end closes exam and auto-submits active sessions", async () => {
    const exam = await prisma.exam.findUnique({
      where: {
        accessCode: "MTH101-FEB26",
      },
      select: {
        id: true,
        lecturerId: true,
      },
    });

    expect(exam).not.toBeNull();
    if (!exam) {
      return;
    }

    const firstLogin = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    const secondLogin = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "EXM-33012",
        surname: "Okafor",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(firstLogin.status).toBe(200);
    expect(secondLogin.status).toBe(200);

    const ended = await updateExamLifecycle(exam.id, { action: "end" }, exam.lecturerId);
    expect(ended.status).toBe(200);
    if (!ended.body.ok) {
      return;
    }

    expect(ended.body.data.autoSubmittedCount).toBeGreaterThanOrEqual(2);

    const submissions = await prisma.submission.findMany({
      where: {
        examId: exam.id,
      },
    });

    expect(submissions).toHaveLength(2);
    expect(submissions.every((submission) => submission.mode === SubmissionMode.timeout)).toBe(true);

    const blockedLogin = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(blockedLogin.status).toBe(403);
    if (!blockedLogin.body.ok) {
      expect(blockedLogin.body.error.code).toBe("EXAM_CLOSED");
    }
  });

  test("autosave upserts answer without creating duplicates", async () => {
    const login = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(login.status).toBe(200);
    if (!login.body.ok) {
      return;
    }

    const runtime = await getExamRuntime({
      examId: login.body.data.examId,
      sessionToken: login.body.data.sessionToken,
    });

    expect(runtime.status).toBe(200);
    if (!runtime.body.ok) {
      return;
    }

    const question = runtime.body.data.questions[0];
    expect(question).toBeDefined();

    const firstSave = await autosaveExamAnswer({
      examId: login.body.data.examId,
      sessionToken: login.body.data.sessionToken,
      questionId: question.questionId,
      selectedOption: question.options[0],
    });

    const secondSave = await autosaveExamAnswer({
      examId: login.body.data.examId,
      sessionToken: login.body.data.sessionToken,
      questionId: question.questionId,
      selectedOption: question.options[1],
    });

    expect(firstSave.status).toBe(200);
    expect(secondSave.status).toBe(200);

    const answerRows = await prisma.answer.findMany({
      where: {
        sessionId: login.body.data.sessionId,
        questionId: question.questionId,
      },
    });

    expect(answerRows).toHaveLength(1);
    expect(answerRows[0]?.selectedOption).toBe(question.options[1]);
  });

  test("duplicate submit race returns same final submission", async () => {
    const login = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "MAT-00123",
        surname: "Adebayo",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(login.status).toBe(200);
    if (!login.body.ok) {
      return;
    }

    const [first, second] = await Promise.all([
      finalizeSubmissionBySessionId(login.body.data.sessionId, SubmissionMode.manual),
      submitExam({
        examId: login.body.data.examId,
        sessionToken: login.body.data.sessionToken,
        mode: "manual",
      }),
    ]);

    expect(first.submission).not.toBeNull();
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);

    const submissions = await prisma.submission.findMany({
      where: {
        sessionId: login.body.data.sessionId,
      },
    });

    expect(submissions).toHaveLength(1);
  });

  test("strike escalation auto-submits at threshold", async () => {
    const login = await loginCandidate(
      {
        examAccessCode: "MTH101-FEB26",
        candidateId: "EXM-33012",
        surname: "Okafor",
      },
      {
        clientIp: "127.0.0.1",
        userAgent: "vitest",
      },
    );

    expect(login.status).toBe(200);
    if (!login.body.ok) {
      return;
    }

    let autoSubmitted = false;
    for (let index = 0; index < 4; index += 1) {
      const event = await ingestExamEvent({
        examId: login.body.data.examId,
        sessionToken: login.body.data.sessionToken,
        eventType: "visibility_hidden",
        hiddenDurationSeconds: 11,
      });

      expect(event.status).toBe(200);
      expect(event.body.ok).toBe(true);
      if (event.body.ok && event.body.data.autoSubmitted) {
        autoSubmitted = true;
      }
    }

    expect(autoSubmitted).toBe(true);

    const submission = await prisma.submission.findUnique({
      where: {
        sessionId: login.body.data.sessionId,
      },
    });

    expect(submission).not.toBeNull();
    expect(submission?.mode).toBe(SubmissionMode.timeout);
  });
});
