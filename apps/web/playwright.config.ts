import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./test",
	testMatch: "offline.spec.ts",
	timeout: 90_000,
	expect: { timeout: 15_000 },
	use: {
		baseURL: "http://localhost:5173",
		...devices["Desktop Chrome"],
	},
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: true,
		timeout: 120_000,
	},
});
