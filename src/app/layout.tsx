import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Room booking: Resource Scheduler + Prisma",
  description:
    "Book meeting rooms without double bookings. Next.js, Resource Scheduler, Prisma ORM, Prisma Postgres and Prisma Compute.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme="system": the scheduler follows the OS light or dark setting, like the page.
    <html lang="en" data-theme="system">
      <body>{children}</body>
    </html>
  );
}
