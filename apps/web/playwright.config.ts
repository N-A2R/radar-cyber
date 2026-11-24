import { defineConfig, devices } from "@playwright/test";

// Une seule origine pour tout : la fixture `baseURL` des specs et le serveur
// que Playwright démarre si aucun serveur n'est déjà fourni.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
	testDir: "./test",
	testMatch: ["offline.spec.ts", "SourcesView.layout.spec.ts", "a11y-contrast.spec.ts"],
	timeout: 90_000,
	expect: { timeout: 15_000 },
	use: {
		baseURL: BASE_URL,
		...devices["Desktop Chrome"],
	},
	// Avec PLAYWRIGHT_BASE_URL, le test vise un serveur déjà lancé (celui de la
	// branche à vérifier) : inutile d'en démarrer un autre sur 5173.
	webServer: process.env.PLAYWRIGHT_BASE_URL
		? undefined
		: {
				command: "pnpm dev",
				url: BASE_URL,
				reuseExistingServer: true,
				timeout: 120_000,
			},
});
