import { PrismaClient, SessionPolicy } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = Date.now();

  await prisma.examSession.deleteMany();
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
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
