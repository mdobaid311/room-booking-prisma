import Link from "next/link";

import { toBookingDTO } from "@/lib/api-types";
import type { RoomDTO } from "@/lib/api-types";
import { CLOSE_HOUR, OPEN_HOUR, officeTime } from "@/lib/office";
import { db, ensureDemoDay, ensureSeeded } from "@/prisma/db";
import { listBookings } from "@/server/bookings";

import { SOURCE_URL, stack } from "./about";
import { Board } from "./board";
import { ThemeToggle } from "./theme-toggle";

export const dynamic = "force-dynamic"; // read the database per request, not at build time

/** The rooms and one day's bookings. */
async function readDay(day: number, now: Date) {
  const [rooms, bookings] = await Promise.all([
    db.orm.public.Room.orderBy([(r) => r.floor.asc(), (r) => r.name.asc()]).all(),
    listBookings(db, officeTime(day, 0, 0, now), officeTime(day + 1, 0, 0, now)),
  ]);
  return { rooms, bookings };
}

export default async function Page() {
  await ensureSeeded(); // a fresh deploy gets the demo rooms on its first visit

  // Open on today, or on tomorrow once today's opening hours are over.
  const now = new Date();
  const day = now >= officeTime(0, CLOSE_HOUR, 0, now) ? 1 : 0;
  const initialDate = day === 0 ? now : officeTime(day, OPEN_HOUR, 0, now);

  await ensureDemoDay(day, now); // and the day on screen gets the demo bookings if it has none

  const { rooms, bookings } = await readDay(day, now);

  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--fg)" />
            <rect x="7" y="9" width="12" height="5" rx="1.5" fill="var(--bg)" />
            <rect x="13" y="18" width="12" height="5" rx="1.5" fill="var(--bg)" />
          </svg>
          Rooms
        </Link>
        <div className="topbar-end">
          <a href={SOURCE_URL}>Source</a>
          <ThemeToggle />
        </div>
      </header>

      <Board
        rooms={rooms.map(({ id, name, floor, seats }): RoomDTO => ({ id, name, floor, seats }))}
        initialBookings={bookings.map(toBookingDTO)}
        initialDate={initialDate.toISOString()}
        serverNow={now.toISOString()}
      />

      <footer className="footer" aria-labelledby="stack-heading">
        <h2 id="stack-heading">Built with</h2>
        <ul className="stack">
          {stack.map((item) => (
            <li key={item.name}>
              <a href={item.href}>
                <span className="stack-logo">{item.logo}</span>
                {item.name}
              </a>
              <p>{item.what}</p>
            </li>
          ))}
        </ul>
      </footer>
    </>
  );
}
