import { AdminRole } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { closeSeedResources, seedDatabase } from "../../prisma/seed";
import { loginCandidate } from "../../src/lib/server/auth-service";
import { getAdminAnalytics, buildAdminAuditReport } from "../../src/lib/server/admin-reporting-service";
import { createAdminExam, listAdminExams, uploadExamRosterCsv } from "../../src/lib/server/admin-exam-service";
import { getExamRuntime, autosaveExamAnswer, submitExam } from "../../src/lib/server/exam-runtime-service";
import { prisma, closePrismaConnections } from "../../src/lib/server/prisma";
import { closeRedisClient } from "../../src/lib/server/redis";
import { getSimilaritySnapshot, runSimilarityDetection } from "../../src/lib/server/similarity-service";

async function testActor() {
  const admin = await prisma.adminUser.findFirst({
    where: {
      role: AdminRole.SUPER_ADMIN,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!admin) {
    throw new Error("Seed admin user not found");
  }

  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    sessionId: "session-seed",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

describe("Final form services", () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  afterAll(async () => {
    await closeRedisClient();
    await closePrismaConnections();
    await closeSeedResources();
  });

  test("admin can create exam and upload roster before exam start", async () => {
    const actor = await testActor();
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endsAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const created = await createAdminExam(
      {
        accessCode: "PHY101-MAR26",
        title: "PHY101: Mechanics",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      actor,
    );

    expect(created.status).toBe(200);
    expect(created.body.ok).toBe(true);
    if (!created.body.ok) {
      return;
    }

    const roster = await uploadExamRosterCsv(
      created.body.data.exam.examId,
      {
        csv: [
          "candidateId,surname,displayName",
          "PHY-0001,Anyanwu,Anyanwu M.",
          "PHY-0002,Bello,Bello A.",
        ].join("\n"),
      },
      actor,
    );

    expect(roster.status).toBe(200);
    expect(roster.body.ok).toBe(true);
    if (!roster.body.ok) {
      return;
    }

    expect(roster.body.data.createdCount).toBe(2);
    expect(roster.body.data.updatedCount).toBe(0);

    const catalog = await listAdminExams();
    expect(catalog.status).toBe(200);
    expect(catalog.body.ok).toBe(true);
    if (!catalog.body.ok) {
      return;
    }

    expect(catalog.body.data.exams.some((exam) => exam.accessCode === "PHY101-MAR26")).toBe(true);
  });

  test("similarity, analytics, and audit export return usable outputs", async () => {
    const actor = await testActor();
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
    if (!firstLogin.body.ok || !secondLogin.body.ok) {
      return;
    }

    const firstRuntime = await getExamRuntime({
      examId: firstLogin.body.data.examId,
      sessionToken: firstLogin.body.data.sessionToken,
    });
    const secondRuntime = await getExamRuntime({
      examId: secondLogin.body.data.examId,
      sessionToken: secondLogin.body.data.sessionToken,
    });

    expect(firstRuntime.status).toBe(200);
    expect(secondRuntime.status).toBe(200);
    if (!firstRuntime.body.ok || !secondRuntime.body.ok) {
      return;
    }

    for (const question of firstRuntime.body.data.questions.slice(0, 4)) {
      await autosaveExamAnswer({
        examId: firstLogin.body.data.examId,
        sessionToken: firstLogin.body.data.sessionToken,
        questionId: question.questionId,
        selectedOption: question.options[0],
      });
    }

    for (const question of secondRuntime.body.data.questions.slice(0, 4)) {
      await autosaveExamAnswer({
        examId: secondLogin.body.data.examId,
        sessionToken: secondLogin.body.data.sessionToken,
        questionId: question.questionId,
        selectedOption: question.options[0],
      });
    }

    const firstSubmit = await submitExam({
      examId: firstLogin.body.data.examId,
      sessionToken: firstLogin.body.data.sessionToken,
      mode: "manual",
    });
    const secondSubmit = await submitExam({
      examId: secondLogin.body.data.examId,
      sessionToken: secondLogin.body.data.sessionToken,
      mode: "manual",
    });

    expect(firstSubmit.status).toBe(200);
    expect(secondSubmit.status).toBe(200);

    const run = await runSimilarityDetection(
      {
        examId: "exam-mth101",
        scoreThreshold: 0.7,
        minCommonAnswers: 3,
      },
      actor,
    );

    expect(run.status).toBe(200);
    expect(run.body.ok).toBe(true);
    if (!run.body.ok) {
      return;
    }

    const snapshot = await getSimilaritySnapshot({
      examId: "exam-mth101",
    });
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.ok).toBe(true);
    if (!snapshot.body.ok) {
      return;
    }

    expect(snapshot.body.data.run).not.toBeNull();

    const analytics = await getAdminAnalytics({
      examId: "exam-mth101",
    });
    expect(analytics.status).toBe(200);
    expect(analytics.body.ok).toBe(true);
    if (!analytics.body.ok) {
      return;
    }

    expect(analytics.body.data.totals.submittedCandidates).toBeGreaterThan(0);

    const report = await buildAdminAuditReport(
      {
        examId: "exam-mth101",
      },
      actor,
    );
    expect(report.status).toBe(200);
    expect(report.body.ok).toBe(true);
    if (!report.body.ok) {
      return;
    }

    expect(report.body.data.candidates.length).toBeGreaterThan(0);

    const similarityRuns = await prisma.similarityRun.count({
      where: {
        examId: "exam-mth101",
      },
    });
    expect(similarityRuns).toBeGreaterThan(0);
  });
});
