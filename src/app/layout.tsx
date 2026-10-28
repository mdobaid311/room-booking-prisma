import type { Metadata, Viewport } from "next";
import { Barlow_Semi_Condensed, Inter } from "next/font/google";

import "./globals.css";

// Inter for the interface, which is mostly small text and times. Barlow is
// drawn after road and wayfinding signs, so it names the rooms and the page.
const text = Inter({ subsets: ["latin"], variable: "--font-text" });
const display = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Rooms: meeting room booking on Prisma",
  description:
    "Book meeting rooms on a timeline, and never book the same room twice. A Next.js template on Prisma ORM, Prisma Postgres and Prisma Compute.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme="system": the scheduler follows the OS light or dark setting, like the page.
    <html lang="en" data-theme="system" className={`${text.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
