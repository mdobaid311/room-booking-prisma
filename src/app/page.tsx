import { db, ensureSeeded } from "@/prisma/db";

export const dynamic = "force-dynamic"; // read the database per request, not at build time

export default async function Page() {
  await ensureSeeded();
  const rooms = await db.orm.public.Room.orderBy((r) => r.name.asc()).all();

  return (
    <main>
      <h1>Rooms</h1>
      <ul>
        {rooms.map((room) => (
          <li key={room.id}>
            {room.name} ({room.seats} seats, {room.floor})
          </li>
        ))}
      </ul>
    </main>
  );
}
