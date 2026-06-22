import { PlannedBlock } from "./engine";

export interface ReconcileEvent {
  id: string;
  name: string;
  start: Date;
  end: Date;
  habitId?: string;
  goalId?: string;
}

export interface ReconcileResult {
  create: PlannedBlock[];
  update: (PlannedBlock & { googleEventId: string })[];
  delete: string[]; // List of googleEventIds to delete
}

export function reconcile(
  desiredBlocks: PlannedBlock[],
  existingEvents: ReconcileEvent[]
): ReconcileResult {
  const result: ReconcileResult = {
    create: [],
    update: [],
    delete: [],
  };

  // Group by (habitId or goalId or name if both are null)
  const getGroupKey = (item: { habitId?: string; goalId?: string; name: string }) => {
    if (item.habitId) return `habit-${item.habitId}`;
    if (item.goalId) return `goal-${item.goalId}`;
    return `name-${item.name}`;
  };

  const desiredGroups: Record<string, PlannedBlock[]> = {};
  for (const b of desiredBlocks) {
    const key = getGroupKey(b);
    desiredGroups[key] = desiredGroups[key] || [];
    desiredGroups[key].push(b);
  }

  const existingGroups: Record<string, ReconcileEvent[]> = {};
  for (const e of existingEvents) {
    const key = getGroupKey(e);
    existingGroups[key] = existingGroups[key] || [];
    existingGroups[key].push(e);
  }

  // Find all unique keys
  const allKeys = new Set([...Object.keys(desiredGroups), ...Object.keys(existingGroups)]);

  for (const key of allKeys) {
    const desired = (desiredGroups[key] || []).sort((a, b) => a.start.getTime() - b.start.getTime());
    const existing = (existingGroups[key] || []).sort((a, b) => a.start.getTime() - b.start.getTime());

    const maxLen = Math.max(desired.length, existing.length);
    for (let i = 0; i < maxLen; i++) {
      const dBlock = desired[i];
      const eEvent = existing[i];

      if (dBlock && eEvent) {
        // Both exist: check if they are identical
        const timeMatch =
          dBlock.start.getTime() === eEvent.start.getTime() &&
          dBlock.end.getTime() === eEvent.end.getTime();
        const nameMatch = dBlock.name === eEvent.name;

        if (!timeMatch || !nameMatch) {
          result.update.push({
            ...dBlock,
            googleEventId: eEvent.id,
          });
        }
      } else if (dBlock) {
        // Extra desired blocks: Create
        result.create.push(dBlock);
      } else if (eEvent) {
        // Extra existing events: Delete
        result.delete.push(eEvent.id);
      }
    }
  }

  return result;
}
