import { SubmissionMode } from "@prisma/client";
import { describe, expect, test, beforeEach, afterAll } from "vitest";

import { closeSeedResources, seedDatabase } from "../../prisma/seed";
import { loginCandidate, validateSession } from "../../src/lib/server/auth-service";
import { getExamRuntime, autosaveExamAnswer, finalizeSubmissionBySessionId, submitExam } from "../../src/lib/server/exam-runtime-service";
import { ingestExamEvent } from "../../src/lib/server/exam-monitoring-service";
import { prisma } from "../../src/lib/server/prisma";


describe("Reliability integration flows", () => {
  beforeEach(async () => {
    await seedDatabase();
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
