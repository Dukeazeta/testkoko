import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/testkoko?schema=public";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
  prismaAdapter?: PrismaPg;
};

const pool = globalForPrisma.prismaPool ?? new Pool({ connectionString: databaseUrl });
const adapter = globalForPrisma.prismaAdapter ?? new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaPool = pool;
  globalForPrisma.prismaAdapter = adapter;
}
