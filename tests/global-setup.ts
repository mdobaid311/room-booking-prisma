import { execFileSync } from "node:child_process";

// Brings TEST_DATABASE_URL up to date with the committed migrations, the same
// way a deploy does. Without TEST_DATABASE_URL the integration tests skip.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execFileSync("npx", ["prisma", "db", "migrate", "--yes"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
