import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SessionPolicy } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/testkoko?schema=public";

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const now = Date.now();

  await prisma.submission.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.sessionQuestion.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.question.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.exam.deleteMany();

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
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
