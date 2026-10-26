import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { defineConfig as composer } from "@prisma/composer/config";
import { nodeBuild } from "@prisma/composer/node/control";
import { nextjsBuild } from "@prisma/composer/nextjs/control";
import { prismaCloud, prismaState } from "@prisma/composer-prisma-cloud/control";

// The prisma CLI does not read .env by itself; load it when there is one, so
// `cp .env.example .env` is all the local setup the db:* scripts need.
try {
  process.loadEnvFile();
} catch {
  // no .env: use the environment as it is (CI, Composer deploys)
}

export default definePrismaConfig({
  skills: {
    agents: [],
  },
  orm: ormConfig({
    contract: "./src/prisma/contract.prisma",
    db: {
      connection: process.env.DATABASE_URL!,
    },
  }),
  composer: composer({
    extensions: [prismaCloud({ region: "us-east-1" }), nodeBuild(), nextjsBuild()],
    state: prismaState(),
  }),
});
