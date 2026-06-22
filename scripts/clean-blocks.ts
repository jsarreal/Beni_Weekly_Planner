import { getAuthedClient } from "../lib/google/oauth";
import { prisma } from "../lib/db";
import { google } from "googleapis";
import { runScheduling } from "../lib/scheduler";

async function clean() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.googleRefresh) {
    console.log("No Google Calendar connected.");
    return;
  }
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: "v3", auth: auth as any }) as any;

  // List all planner events up to 90 days in the future
  const now = new Date();
  const timeMin = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
  const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days in the future

  console.log("Fetching planner events...");
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    privateExtendedProperty: ["beniPlanner=1"],
    singleEvents: true,
  });

  const items = response.data.items || [];
  console.log(`Found ${items.length} planner events to delete.`);

  for (const item of items) {
    if (item.id) {
      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: item.id,
        });
        console.log(`Deleted Google Calendar event: ${item.summary} (${item.id})`);
      } catch (err) {
        console.error(`Failed to delete event ${item.id}:`, err);
      }
    }
  }

  // Delete all blocks from database
  const deletedDb = await prisma.block.deleteMany({});
  console.log(`Deleted ${deletedDb.count} blocks from the database.`);

  console.log("Re-running scheduler...");
  await runScheduling();
  console.log("Clean and reschedule completed successfully!");
}

clean().catch(console.error);
