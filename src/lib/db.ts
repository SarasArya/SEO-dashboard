import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// One PrismaClient across hot-reloads / route handlers.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const log = process.env.PRISMA_LOG === "1" ? (["query", "warn", "error"] as const) : (["warn", "error"] as const);

  // In production (Vercel) point Prisma at Turso via the libSQL driver adapter.
  // Locally, with no Turso URL set, fall back to the SQLite file in DATABASE_URL.
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
    return new PrismaClient({ adapter, log: [...log] });
  }
  return new PrismaClient({ log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
