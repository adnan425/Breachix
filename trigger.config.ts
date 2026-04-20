import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalFiles, aptGet } from "@trigger.dev/build/extensions/core";
import { playwright } from "@trigger.dev/build/extensions/playwright";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: "proj_oaexfrhqalowlforgrsg",
  runtime: "node",
  logLevel: "log",
  maxDuration: 3600,

  retries: {
    enabledInDev: false,       // ← turn off during dev, easier to debug
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },

  dirs: ["./src/trigger"],     // ← keep this, just make sure folder exists

  build: {
    external: ["playwright", "playwright-core"],

    extensions: [
      // Prompt .txt files bundled with worker
      additionalFiles({ files: ["./src/prompts/**"] }),

      // Playwright Chromium for exploit agents
      playwright({ browsers: ["chromium"], headless: true }),

      // Prisma client — REQUIRED for DB access inside tasks
      prismaExtension({
        schema: "./prisma/schema.prisma",
      }),

      // CLI tools installed on deployed worker
      aptGet({
        packages: [
          "nmap",
          "curl",
          "wget",
          "git",
          "python3",
          "python3-pip",
          "golang-go",
        ],
      }),
    ],
  },
});