-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "dayWindows" TEXT NOT NULL,
    "blackoutDays" TEXT NOT NULL DEFAULT '[]',
    "agentReviewMin" INTEGER NOT NULL DEFAULT 1080,
    "agentProvider" TEXT NOT NULL DEFAULT 'openrouter',
    "email" TEXT,
    "googleRefresh" TEXT,
    "googleAccessTok" TEXT,
    "googleTokenExp" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "perWeek" INTEGER NOT NULL,
    "timeOfDay" TEXT NOT NULL DEFAULT 'any',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "fixedDays" TEXT NOT NULL DEFAULT '[]',
    "type" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "totalEffortMin" INTEGER NOT NULL,
    "completedMin" INTEGER NOT NULL DEFAULT 0,
    "deadline" DATETIME NOT NULL,
    "earliestStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionMinMin" INTEGER NOT NULL DEFAULT 30,
    "sessionMaxMin" INTEGER NOT NULL DEFAULT 120,
    "timeOfDay" TEXT NOT NULL DEFAULT 'any',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "googleEventId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'planner',
    "habitId" TEXT,
    "goalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "adjustments" TEXT NOT NULL DEFAULT '{}',
    "feedback" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
