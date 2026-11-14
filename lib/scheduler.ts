// Optimal posting schedule based on YouTube Shorts engagement data
// Best: Weekday 12-2PM & 6-9PM | Weekend 10AM-2PM & 7-9PM
// Worst: 11PM - 5AM

export interface TimeSlot {
  date: Date;
  score: number; // higher = better
}

function getSlotScore(date: Date): number {
  const hour = date.getHours();
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const isWeekend = day === 0 || day === 6;

  // Dead zone
  if (hour >= 23 || hour < 5) return 0;

  if (!isWeekend) {
    // Weekdays
    if (hour >= 18 && hour < 21) return 100; // Prime: 6-9PM
    if (hour >= 12 && hour < 14) return 90;  // Lunch: 12-2PM
    if (hour >= 15 && hour < 18) return 70;  // Wed/Fri afternoon bonus
    if (hour >= 9 && hour < 12) return 50;
    if (hour >= 14 && hour < 15) return 60;
    return 30;
  } else {
    // Weekends
    if (hour >= 10 && hour < 14) return 85;  // 10AM-2PM
    if (hour >= 19 && hour < 21) return 80;  // 7-9PM
    if (hour >= 14 && hour < 19) return 55;
    return 25;
  }
}

// Generate optimal slots starting from `from`, spacing them `minGapHours` apart
export function generateScheduleSlots(
  count: number,
  from: Date = new Date(),
  minGapHours = 4
): Date[] {
  const slots: Date[] = [];
  let cursor = new Date(from);
  // Start at least 10 minutes from now
  cursor.setMinutes(cursor.getMinutes() + 10);

  // We'll search forward up to 365 days worth of hourly slots
  const maxIterations = 365 * 24;
  let iterations = 0;

  while (slots.length < count && iterations < maxIterations) {
    // Round to next hour
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(cursor.getHours() + 1);

    const score = getSlotScore(cursor);
    if (score > 0) {
      // Check gap from last assigned slot
      const lastSlot = slots[slots.length - 1];
      const gapOk =
        !lastSlot ||
        (cursor.getTime() - lastSlot.getTime()) / 3600000 >= minGapHours;

      if (gapOk) {
        slots.push(new Date(cursor));
      }
    }
    iterations++;
  }

  return slots;
}

// Sort slots by score descending to pick best ones when count is limited
export function getBestSlots(slots: Date[]): Date[] {
  return [...slots].sort((a, b) => getSlotScore(b) - getSlotScore(a));
}

export function formatPublishAt(date: Date): string {
  return date.toISOString();
}
