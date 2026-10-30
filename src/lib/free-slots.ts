import { findAvailableSlots } from "resource-scheduler/headless";

import { CLOSE_HOUR, OPEN_HOUR, SLOT_MINUTES, officeTime } from "./office.ts";
import { startOfCurrentSlot } from "./rules.ts";

type Room = { id: string; seats: number };
type Span = { roomId: string; startsAt: Date; endsAt: Date };
export type FreeSlot = { roomId: string; start: Date; end: Date };

/**
 * The first free `minutes` of each room with at least `seats` seats, on each
 * office day between `from` and `to`: earliest first, and the smallest room
 * first at the same time. The search window of a day is its opening hours from
 * the current slot on, so every slot passes the booking rules.
 */
export function findFreeSlots(
  rooms: Room[],
  bookings: Span[],
  { from, to, minutes, seats, now, limit = 6 }: { from: Date; to: Date; minutes: number; seats: number; now: Date; limit?: number },
): FreeSlot[] {
  const found: (FreeSlot & { seats: number })[] = [];
  const earliest = startOfCurrentSlot(now);

  // Day 0 is today on the office clock: earlier days cannot be booked. The API
  // serves at most 62 days, so no window on screen is longer.
  for (let day = 0; day <= 62; day++) {
    const open = officeTime(day, OPEN_HOUR, 0, now);
    if (open >= to) break;
    const start = new Date(Math.max(+open, +from, +earliest));
    const end = new Date(Math.min(+officeTime(day, CLOSE_HOUR, 0, now), +to));
    if (start >= end) continue;

    for (const room of rooms.filter((r) => r.seats >= seats)) {
      const events = bookings
        .filter((b) => b.roomId === room.id)
        .map((b, i) => ({ id: String(i), title: "", startDate: b.startsAt, endDate: b.endsAt }));
      const [slot] = findAvailableSlots(
        { id: room.id, name: "", events },
        { from: start, to: end, duration: minutes, step: SLOT_MINUTES, limit: 1 },
      );
      if (slot) found.push({ roomId: room.id, seats: room.seats, ...slot });
    }
  }

  return found
    .sort((a, b) => +a.start - +b.start || a.seats - b.seats)
    .slice(0, limit)
    .map(({ roomId, start, end }) => ({ roomId, start, end }));
}
