import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./test",
	testMatch: ["offline.spec.ts", "SourcesView.layout.spec.ts"],
	timeout: 90_000,
	expect: { timeout: 15_000 },
	use: {
		baseURL: "http://localhost:5173",
		...devices["Desktop Chrome"],
	},
	// Avec PLAYWRIGHT_BASE_URL, le test vise un serveur déjà lancé (celui de la
	// branche à vérifier) : inutile d'en démarrer un autre sur 5173.
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: "pnpm dev",
				url: "http://localhost:5173",
				reuseExistingServer: true,
				timeout: 120_000,
			},
});
