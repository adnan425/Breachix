import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalFiles } from "@trigger.dev/build/extensions/core";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_oaexfrhqalowlforgrsg",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    // PlaywrightExtension only externals `playwright` for deploy — in `trigger dev`, esbuild
    // otherwise bundles `playwright-core` and fails on optional `chromium-bidi/...` requires.
    external: ["playwright", "playwright-core"],
    extensions: [
      additionalFiles({ files: ["./src/prompts/**"] }),
      // Recon-lite uses Playwright Chromium on the worker (Shannon-style live DOM / runtime).
      playwright({ browsers: ["chromium"], headless: true }),
    ],
    // Pre-recon runs CLIs on the worker (curl, dig, whatweb, nmap, subfinder, httpx, whois).
    // For **deployed** workers, install those binaries in your image or use e.g. `aptGet` from
    // `@trigger.dev/build/extensions/core` so Trigger runs match your local dev host.
  },
});
