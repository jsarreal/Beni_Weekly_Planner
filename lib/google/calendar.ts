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

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
  });

  return response.data.items || [];
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


