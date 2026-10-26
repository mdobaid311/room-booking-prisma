import { toBookingDTO } from "@/lib/api-types";
import type { RoomDTO } from "@/lib/api-types";
import { CLOSE_HOUR, OPEN_HOUR, officeTime } from "@/lib/office";
import { db, ensureSeeded } from "@/prisma/db";
import { listBookings } from "@/server/bookings";

import { Board } from "./board";

export const dynamic = "force-dynamic"; // read the database per request, not at build time

export default async function Page() {
  await ensureSeeded(); // a fresh deploy gets the demo rooms on its first visit

  // Open on today, or on tomorrow once today's opening hours are over.
  const now = new Date();
  const day = now >= officeTime(0, CLOSE_HOUR, 0, now) ? 1 : 0;
  const initialDate = day === 0 ? now : officeTime(day, OPEN_HOUR, 0, now);

  const [rooms, bookings] = await Promise.all([
    db.orm.public.Room.orderBy([(r) => r.floor.asc(), (r) => r.name.asc()]).all(),
    listBookings(db, officeTime(day, 0, 0, now), officeTime(day + 1, 0, 0, now)),
  ]);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Room booking</h1>
        <p className="muted">
          A starter for booking meeting rooms without double bookings, built with{" "}
          <a href="https://www.npmjs.com/package/resource-scheduler">Resource Scheduler</a>,{" "}
          <a href="https://www.prisma.io/orm">Prisma ORM</a>, <a href="https://www.prisma.io/postgres">Prisma Postgres</a>{" "}
          and <a href="https://www.prisma.io/compute">Prisma Compute</a>.
        </p>
      </header>

      <Board
        rooms={rooms.map(({ id, name, floor, seats }): RoomDTO => ({ id, name, floor, seats }))}
        initialBookings={bookings.map(toBookingDTO)}
        initialDate={initialDate.toISOString()}
      />

      <footer className="page-footer muted">
        Two people booking the same slot at the same moment: the server checks again inside a transaction, and one of
        them gets a clear message while their change rolls back.
      </footer>
    </main>
  );
}
