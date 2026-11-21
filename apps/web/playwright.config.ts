import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
