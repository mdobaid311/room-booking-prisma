// What this template is and how it works, below the booking board. Delete this
// file and its use in page.tsx when the app is yours.

export const SOURCE_URL = "https://github.com/mdobaid311/room-booking-prisma-template";
export const DEPLOY_URL = `https://console.prisma.io/new/clone?repository-url=${encodeURIComponent(SOURCE_URL)}&project-name=room-booking-prisma-template`;

const steps = [
  {
    where: "In your browser",
    what: "The timeline runs the same rules as the server, so a taken slot or a time that has passed turns red before you let go.",
    code: "bookingRules()",
  },
  {
    where: "On the server",
    what: "A Prisma ORM transaction locks the room, reads its bookings again and checks the same rules. Two requests for one room take turns, and the second one is told what is in the way.",
    code: "Room.where({ id }).forNoKeyUpdate()",
  },
  {
    where: "In Postgres",
    what: "An exclusion constraint refuses two bookings of one room that overlap, even from a write that skips the app.",
    code: "EXCLUDE USING gist",
  },
];

// The marks belong to their owners. Next.js is from Simple Icons 16.34.0 (CC0),
// drawn in the text color. Prisma is its current mark, from prisma.io/icon.svg,
// in its own colors. Resource Scheduler has no logo, so it gets three bookings
// on a timeline.
const nextLogo = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z"
    />
  </svg>
);

const prismaLogo = (
  <svg viewBox="0 0 263 264" aria-hidden="true">
    <path fill="#04D5E7" d="M57.3357 92.5003L0 149.939V53.5L53.2105 0.10425V0H149.524L57.3357 92.5003Z" />
    <path fill="#FE4352" d="M263 91.7452L91.0537 264H0V172.229L171.92 0H263V91.7452Z" />
    <path fill="#FEBE29" d="M209.686 264H113.373L156.453 220.773L263.001 114.034V210.5L209.686 264Z" />
  </svg>
);

const schedulerLogo = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M4 4h8a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4zM10 10h10a2 2 0 0 1 0 4H10a2 2 0 0 1 0-4zM6 16h6a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4z"
    />
  </svg>
);

export const stack = [
  {
    name: "Next.js 16",
    what: "App Router. The page reads the rooms and the day's bookings on the server; the timeline runs in the browser.",
    href: "https://nextjs.org",
    logo: nextLogo,
  },
  {
    name: "Prisma ORM 8",
    what: "Typed queries and migrations from one schema contract. Every booking change runs in a transaction.",
    href: "https://www.prisma.io/orm",
    logo: prismaLogo,
  },
  {
    name: "Prisma Postgres",
    what: "Stores the rooms and bookings. Every deploy, preview and laptop gets a database of its own.",
    href: "https://www.prisma.io/postgres",
    logo: prismaLogo,
  },
  {
    name: "Prisma Compute",
    what: "Runs the Next.js server. module.ts declares the app and its database, and a deploy provisions both.",
    href: "https://www.prisma.io/compute",
    logo: prismaLogo,
  },
  {
    name: "Resource Scheduler",
    what: "The timeline: drag to book, move and resize.",
    href: "https://www.npmjs.com/package/resource-scheduler",
    logo: schedulerLogo,
  },
];

export function About({ rooms, bookings, queryMs }: { rooms: number; bookings: number; queryMs: number }) {
  return (
    <>
      <section className="how" id="how" aria-labelledby="how-heading">
        <h2 id="how-heading">Why a room can never be booked twice</h2>
        <p className="lede">
          Every booking passes three checks on its way in. The last two hold when two people click the same slot at the
          same moment.
        </p>
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.where}>
              <h3>{step.where}</h3>
              <p>{step.what}</p>
              <code>{step.code}</code>
            </li>
          ))}
        </ol>
        <p className="proof">The tests send 25 bookings for the same slot at once. Exactly one gets through.</p>
      </section>

      <section className="stack" aria-labelledby="stack-heading">
        <div className="stack-intro">
          <h2 id="stack-heading">Built on Prisma, end to end</h2>
          <p className="live">
            This page read {rooms} rooms and {bookings} bookings from Prisma Postgres in <strong>{queryMs} ms</strong>.
          </p>
          <div className="actions">
            <a className="button primary" href={DEPLOY_URL}>
              Deploy your own
            </a>
            <a className="button" href={SOURCE_URL}>
              View source
            </a>
          </div>
          <p className="agent-note">
            Setting it up with a coding agent? Point it at <code>AGENTS.md</code>: it covers setup, schema changes and
            deploys.
          </p>
        </div>
        <dl className="stack-list">
          {stack.map((item) => (
            <div key={item.name}>
              <dt>
                <a href={item.href}>{item.name}</a>
              </dt>
              <dd>{item.what}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
