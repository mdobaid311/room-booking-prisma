import type { Metadata, Viewport } from "next";

import "./globals.css";

const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: "Rooms: meeting room booking on Prisma",
  description:
    "Book meeting rooms on a timeline, and never book the same room twice. A Next.js template on Prisma ORM, Prisma Postgres and Prisma Compute.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme="system": the page and the scheduler follow the OS light or dark
    // setting, until the theme button picks one. The script applies that choice
    // before the first paint, so React is told the attribute may differ.
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
