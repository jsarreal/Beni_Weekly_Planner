import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
// Strip the "file:" prefix that SQLite URLs use
const dbPath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;

const adapter = new PrismaBetterSqlite3({ url: dbPath });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
