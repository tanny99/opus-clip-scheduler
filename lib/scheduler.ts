// Generate slots starting from `from`, one per hour, no restrictions.
export function generateScheduleSlots(count: number, from: Date = new Date()): Date[] {
  const slots: Date[] = [];
  // Start 5 minutes from now, rounded up to next hour
  const start = new Date(from);
  start.setMinutes(start.getMinutes() + 5);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  for (let i = 0; i < count; i++) {
    const slot = new Date(start);
    slot.setHours(slot.getHours() + i);
    slots.push(slot);
  }
  return slots;
}

export function formatPublishAt(date: Date): string {
  return date.toISOString();
}
