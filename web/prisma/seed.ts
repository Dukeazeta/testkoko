import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { AdminRole, PrismaClient, SessionPolicy } from "@prisma/client";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";

import { hashPassword } from "../src/lib/server/security";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/testkoko?schema=public";

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function seedDatabase() {
  const now = Date.now();

  await prisma.adminSession.deleteMany();
  await prisma.eventLog.deleteMany();
  await prisma.adminActionLog.deleteMany();
  await prisma.strikeState.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.sessionQuestion.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.question.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.adminUser.deleteMany();

  const exam = await prisma.exam.create({
    data: {
      id: "exam-mth101",
      accessCode: "MTH101-FEB26",
      title: "MTH101: Introductory Mathematics",
      startsAt: new Date(now - 30 * 60 * 1000),
      endsAt: new Date(now + 3 * 60 * 60 * 1000),
      sessionPolicy: SessionPolicy.BlockNew,
    },
  });

  await prisma.candidate.createMany({
    data: [
      {
        id: "cand-001",
        examId: exam.id,
        candidateId: "MAT-00123",
        surnameNormalized: "adebayo",
        displayName: "Adebayo T.",
      },
      {
        id: "cand-002",
        examId: exam.id,
        candidateId: "EXM-33012",
        surnameNormalized: "okafor",
        displayName: "Okafor J.",
      },
    ],
  });

  await prisma.question.createMany({
    data: [
      {
        id: "q-mth101-1",
        examId: exam.id,
        prompt: "What is 12 + 9?",
        options: ["19", "20", "21", "22"],
        correctOption: "21",
      },
      {
        id: "q-mth101-2",
        examId: exam.id,
        prompt: "Solve: 7 x 8",
        options: ["54", "56", "58", "60"],
        correctOption: "56",
      },
      {
        id: "q-mth101-3",
        examId: exam.id,
        prompt: "Which value is prime?",
        options: ["21", "27", "31", "33"],
        correctOption: "31",
      },
      {
        id: "q-mth101-4",
        examId: exam.id,
        prompt: "What is 3/4 as a decimal?",
        options: ["0.5", "0.65", "0.7", "0.75"],
        correctOption: "0.75",
      },
      {
        id: "q-mth101-5",
        examId: exam.id,
        prompt: "Simplify: 2(x + 5) when x = 4",
        options: ["12", "14", "16", "18"],
        correctOption: "18",
      },
    ],
  });

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@testkoko.local").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin12345";
  const adminDisplayName = process.env.ADMIN_DISPLAY_NAME ?? "System Admin";

  await prisma.adminUser.create({
    data: {
      email: adminEmail,
      displayName: adminDisplayName,
      role: AdminRole.SUPER_ADMIN,
      passwordHash: hashPassword(adminPassword),
    },
  });

  const proctorEmail = process.env.PROCTOR_EMAIL?.trim().toLowerCase();
  const proctorPassword = process.env.PROCTOR_PASSWORD?.trim();
  if (proctorEmail && proctorPassword) {
    await prisma.adminUser.create({
      data: {
        email: proctorEmail,
        displayName: process.env.PROCTOR_DISPLAY_NAME ?? "Exam Proctor",
        role: AdminRole.PROCTOR,
        passwordHash: hashPassword(proctorPassword),
      },
    });
  }
}

export async function closeSeedResources() {
  await prisma.$disconnect();
  await pool.end();
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  seedDatabase()
    .then(async () => {
      await closeSeedResources();
    })
    .catch(async (error) => {
      console.error(error);
      await closeSeedResources();
      process.exit(1);
    });
}
