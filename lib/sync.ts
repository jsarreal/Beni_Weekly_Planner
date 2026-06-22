import { getAuthedClient } from "./google/oauth";
import { getSettings } from "./settings";
import { prisma } from "./db";
import { runScheduling } from "./scheduler";
import { getInitialSyncToken, listIncrementalEvents } from "./google/calendar";

export async function syncCalendar(): Promise<{ synced: boolean; replanned: boolean; error?: string }> {
  const settings = await getSettings();
  if (!settings.googleRefresh) {
    return { synced: false, replanned: false, error: "Google Calendar not connected" };
  }

  const auth = await getAuthedClient();
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowStart = startOfToday;
  const windowEnd = new Date(startOfToday.getTime() + 14 * 24 * 60 * 60 * 1000);

  // 1. Initial Sync Setup (no sync token exists)
  if (!settings.googleSyncToken) {
    try {
      console.log("[Sync] Storing initial sync token...");
      const syncToken = await getInitialSyncToken(auth);
      await prisma.settings.update({
        where: { id: 1 },
        data: { googleSyncToken: syncToken },
      });
      // Initial full schedule run
      await runScheduling();
      return { synced: true, replanned: true };
    } catch (err: any) {
      console.error("[Sync] Failed to initialize sync token:", err);
      return { synced: false, replanned: false, error: err.message || err };
    }
  }

  // 2. Incremental Sync
  try {
    const { items, nextSyncToken } = await listIncrementalEvents(auth, settings.googleSyncToken);

    let changedInWindow = false;
    for (const item of items) {
      // If event cancelled, or starts/ends in our window, we need to replan
      if (item.status === "cancelled") {
        changedInWindow = true;
        break;
      }
      const start = new Date(item.start?.dateTime || item.start?.date || "");
      const end = new Date(item.end?.dateTime || item.end?.date || "");
      if (
        (start >= windowStart && start <= windowEnd) ||
        (end >= windowStart && end <= windowEnd) ||
        (start < windowStart && end > windowEnd)
      ) {
        changedInWindow = true;
        break;
      }
    }

    let replanned = false;
    if (changedInWindow && items.length > 0) {
      console.log("[Sync] Detected calendar changes within planning window. Running scheduler...");
      await runScheduling();
      replanned = true;
    }

    // Save the new token
    if (nextSyncToken) {
      await prisma.settings.update({
        where: { id: 1 },
        data: { googleSyncToken: nextSyncToken },
      });
    }

    return { synced: true, replanned };
  } catch (err: any) {
    // 3. Handle 410 (invalid sync token / expired)
    const is410 = err.code === 410 || err.status === 410 || (err.message && err.message.includes("410"));
    if (is410) {
      console.warn("[Sync] Sync token invalid or expired (410). Resetting and running full sync...");
      try {
        const syncToken = await getInitialSyncToken(auth);
        await prisma.settings.update({
          where: { id: 1 },
          data: { googleSyncToken: syncToken },
        });
        await runScheduling();
        return { synced: true, replanned: true };
      } catch (innerErr: any) {
        console.error("[Sync] Full resync fallback failed:", innerErr);
        return { synced: false, replanned: false, error: innerErr.message || innerErr };
      }
    }

    console.error("[Sync] Incremental sync failed:", err);
    return { synced: false, replanned: false, error: err.message || err };
  }
}
