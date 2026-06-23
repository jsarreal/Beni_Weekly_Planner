import { google, calendar_v3 } from "googleapis";
import { PlannedBlock } from "../engine";

export interface CalendarEventResponse {
  id: string;
  name: string;
  start: Date;
  end: Date;
  habitId?: string;
  goalId?: string;
}

export async function listPlannerEvents(
  auth: any,
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEventResponse[]> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;
  
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    privateExtendedProperty: ["beniPlanner=1"],
    singleEvents: true,
  });

  const items = response.data.items || [];
  return items.map((item: any) => ({
    id: item.id || "",
    name: item.summary || "",
    start: new Date(item.start?.dateTime || item.start?.date || ""),
    end: new Date(item.end?.dateTime || item.end?.date || ""),
    habitId: item.extendedProperties?.private?.habitId,
    goalId: item.extendedProperties?.private?.goalId,
  }));
}

export async function createPlannerEvent(auth: any, block: PlannedBlock): Promise<any> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;

  const privateProperties: Record<string, string> = {
    beniPlanner: "1",
  };
  if (block.habitId) privateProperties.habitId = block.habitId;
  if (block.goalId) privateProperties.goalId = block.goalId;

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: block.name,
      start: {
        dateTime: block.start.toISOString(),
      },
      end: {
        dateTime: block.end.toISOString(),
      },
      extendedProperties: {
        private: privateProperties,
      },
    },
  });

  return response.data;
}

export async function updatePlannerEvent(
  auth: any,
  googleEventId: string,
  block: PlannedBlock
): Promise<any> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;

  const privateProperties: Record<string, string> = {
    beniPlanner: "1",
  };
  if (block.habitId) privateProperties.habitId = block.habitId;
  if (block.goalId) privateProperties.goalId = block.goalId;

  const response = await calendar.events.update({
    calendarId: "primary",
    eventId: googleEventId,
    requestBody: {
      summary: block.name,
      start: {
        dateTime: block.start.toISOString(),
      },
      end: {
        dateTime: block.end.toISOString(),
      },
      extendedProperties: {
        private: privateProperties,
      },
    },
  });

  return response.data;
}

export async function deletePlannerEvent(auth: any, googleEventId: string): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;

  await calendar.events.delete({
    calendarId: "primary",
    eventId: googleEventId,
  });
}

export async function listAllEvents(
  auth: any,
  timeMin: Date,
  timeMax: Date
): Promise<any[]> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;

  // Fetch all user calendars so we pick up events not in the primary calendar
  const calListRes = await calendar.calendarList.list({ minAccessRole: "reader" });
  const calItems = calListRes.data.items || [];
  let calIds: string[] = calItems.map((c: any) => c.id as string).filter(Boolean);

  console.log(`[Calendar] Found ${calIds.length} calendars: ${calItems.map((c: any) => `"${c.summary}" (${c.id})`).join(", ")}`);

  if (calIds.length === 0) calIds = ["primary"];

  const results = await Promise.allSettled(
    calIds.map(calendarId =>
      calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
      })
    )
  );

  const allEvents: any[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const calId = calIds[i];
    if (result.status === "fulfilled") {
      const count = result.value.data.items?.length ?? 0;
      if (count > 0) console.log(`[Calendar] "${calId}" → ${count} events`);
      allEvents.push(...(result.value.data.items || []));
    } else {
      console.error(`[Calendar] Failed to fetch "${calId}":`, (result.reason as any)?.message ?? result.reason);
    }
  }

  // Deduplicate by event ID (shared events may appear in multiple calendars)
  const seen = new Set<string>();
  return allEvents.filter(e => {
    if (!e.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export async function getInitialSyncToken(auth: any): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;
  let pageToken: string | undefined = undefined;
  let nextSyncToken: string | undefined = undefined;

  do {
    const response: any = await calendar.events.list({
      calendarId: "primary",
      pageToken,
      maxResults: 250,
    });
    nextSyncToken = response.data.nextSyncToken;
    pageToken = response.data.nextPageToken;
  } while (pageToken && !nextSyncToken);

  if (!nextSyncToken) {
    throw new Error("Failed to retrieve initial sync token from Google Calendar");
  }
  return nextSyncToken;
}

export async function listIncrementalEvents(
  auth: any,
  syncToken: string
): Promise<{ items: any[]; nextSyncToken?: string }> {
  const calendar = google.calendar({ version: "v3", auth }) as calendar_v3.Calendar;

  const response = await calendar.events.list({
    calendarId: "primary",
    syncToken,
  });

  return {
    items: response.data.items || [],
    nextSyncToken: response.data.nextSyncToken || undefined,
  };
}


