import "dotenv/config";

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient, SessionPolicy } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { hash } from "bcryptjs";

function buildSeedClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }

  const adapter = new PrismaLibSql({ url, authToken });

  return new PrismaClient({ adapter });
}

const prisma = buildSeedClient();

type SeedOptions = {
  reset?: boolean;
};

const demoCandidates = [
  {
    id: "cand-001",
    candidateId: "MAT-00123",
    surnameNormalized: "adebayo",
    displayName: "Adebayo T.",
  },
  {
    id: "cand-002",
    candidateId: "EXM-33012",
    surnameNormalized: "okafor",
    displayName: "Okafor J.",
  },
];

const demoQuestions = [
  {
    id: "q-mth101-1",
    prompt: "What is 12 + 9?",
    options: ["19", "20", "21", "22"],
    correctOption: "21",
  },
  {
    id: "q-mth101-2",
    prompt: "Solve: 7 x 8",
    options: ["54", "56", "58", "60"],
    correctOption: "56",
  },
  {
    id: "q-mth101-3",
    prompt: "Which value is prime?",
    options: ["21", "27", "31", "33"],
    correctOption: "31",
  },
  {
    id: "q-mth101-4",
    prompt: "What is 3/4 as a decimal?",
    options: ["0.5", "0.65", "0.7", "0.75"],
    correctOption: "0.75",
  },
  {
    id: "q-mth101-5",
    prompt: "Simplify: 2(x + 5) when x = 4",
    options: ["12", "14", "16", "18"],
    correctOption: "18",
  },
];

export async function seedDatabase(options: SeedOptions = {}) {
  const shouldReset = options.reset ?? false;
  const now = Date.now();

  if (shouldReset) {
    await prisma.eventLog.deleteMany();
    await prisma.strikeState.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.answer.deleteMany();
    await prisma.sessionQuestion.deleteMany();
    await prisma.examSession.deleteMany();
    await prisma.question.deleteMany();
    await prisma.candidate.deleteMany();
    await prisma.exam.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();
  }

  const lecturerEmail = (process.env.ADMIN_EMAIL ?? "lecturer@testkoko.local").trim().toLowerCase();
  const lecturerPassword = process.env.ADMIN_PASSWORD ?? "admin12345";
  const lecturerName = process.env.ADMIN_DISPLAY_NAME ?? "Demo Lecturer";
  const passwordHash = await hash(lecturerPassword, 12);

  const lecturer = await prisma.user.upsert({
    where: {
      email: lecturerEmail,
    },
    update: {
      name: lecturerName,
      password: passwordHash,
    },
    create: {
      email: lecturerEmail,
      name: lecturerName,
      password: passwordHash,
    },
  });

  const exam = await prisma.exam.upsert({
    where: {
      id: "exam-mth101",
    },
    update: {
      accessCode: "MTH101-FEB26",
      title: "MTH101: Introductory Mathematics",
      startsAt: new Date(now - 30 * 60 * 1000),
      endsAt: new Date(now + 3 * 60 * 60 * 1000),
      sessionPolicy: SessionPolicy.BlockNew,
      lecturerId: lecturer.id,
    },
    create: {
      id: "exam-mth101",
      accessCode: "MTH101-FEB26",
      title: "MTH101: Introductory Mathematics",
      startsAt: new Date(now - 30 * 60 * 1000),
      endsAt: new Date(now + 3 * 60 * 60 * 1000),
      sessionPolicy: SessionPolicy.BlockNew,
      lecturerId: lecturer.id,
    },
  });

  for (const candidate of demoCandidates) {
    await prisma.candidate.upsert({
      where: {
        examId_candidateId: {
          examId: exam.id,
          candidateId: candidate.candidateId,
        },
      },
      update: {
        surnameNormalized: candidate.surnameNormalized,
        displayName: candidate.displayName,
      },
      create: {
        id: candidate.id,
        examId: exam.id,
        candidateId: candidate.candidateId,
        surnameNormalized: candidate.surnameNormalized,
        displayName: candidate.displayName,
      },
    });
  }

  for (const question of demoQuestions) {
    await prisma.question.upsert({
      where: {
        id: question.id,
      },
      update: {
        examId: exam.id,
        prompt: question.prompt,
        options: question.options,
        correctOption: question.correctOption,
      },
      create: {
        id: question.id,
        examId: exam.id,
        prompt: question.prompt,
        options: question.options,
        correctOption: question.correctOption,
      },
    });
  }
}

export async function closeSeedResources() {
  await prisma.$disconnect();
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  const shouldReset = process.argv.includes("--reset") || process.env.SEED_MODE === "reset";
  const allowDestructiveSeed = process.env.ALLOW_DESTRUCTIVE_SEED === "true";
  const runningInProduction = process.env.NODE_ENV === "production";

  if (shouldReset && runningInProduction && !allowDestructiveSeed) {
    console.error("Refusing destructive seed in production. Set ALLOW_DESTRUCTIVE_SEED=true with --reset if intentional.");
    process.exit(1);
  }

  seedDatabase({ reset: shouldReset })
    .then(async () => {
      console.log(shouldReset ? "Seed completed in reset mode." : "Seed completed in upsert mode.");
      await closeSeedResources();
    })
    .catch(async (error) => {
      console.error(error);
      await closeSeedResources();
      process.exit(1);
    });
}
