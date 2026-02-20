import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma CLI commands (migrate diff, db push) use a local SQLite file.
    // The runtime adapter (@prisma/adapter-libsql) handles remote Turso connections.
    url: "file:./dev.db",
  },
});
