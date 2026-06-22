import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  if (databaseUrl.startsWith("file:")) {
    return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl.slice(5) }) });
  }
  throw new Error(
    `Unsupported DATABASE_URL "${databaseUrl}". Phase 1 supports SQLite (file:) only; ` +
    `Postgres requires wiring @prisma/adapter-pg.`
  );
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
