import { expect, test, type BrowserContext, type Route } from "@playwright/test";

/**
 * Bascule réseau réelle : la carte charge ses données en ligne, puis le
 * contexte navigatingeur passe hors ligne et la page est rechargée. Les
 * ressources sont rejouées depuis le cache Playwright (le serveur Vite n'est
 * plus joignable), mais aucune réponse API n'est simulée après la bascule :
 * c'est bien la panne réseau que l'application doit encaisser.
 */

const ORGS = Array.from({ length: 12 }, (_, i) => ({
	id: i + 1,
	name: `Organisation ${String(i + 1).padStart(2, "0")}`,
	slug: `organisation-${i + 1}`,
	kind: "collectivite",
	sector: "commune",
	city: "Bordeaux",
	dept: "33",
	domain: null,
	lat: 44.84 + i / 1000,
	lon: -0.58 + i / 1000,
	eventCount: i + 1,
}));

const EVENTS = ORGS.slice(0, 3).map((org, i) => ({
	id: `evt-${i}`,
	dedupKey: `evt-${i}`,
	family: "cyber",
	assertionType: "incident",
	title: `Incident ${i + 1}`,
	summary: null,
	observedAt: "2026-11-21T10:00:00Z",
	severity: 2,
	confidence: 0.9,
	sourceId: "source-test",
	sourceUrl: "https://example.org/incident",
	geoType: "point",
	lat: org.lat,
	lon: org.lon,
	orgId: org.id,
	regional: true,
}));

type Ressource = { status: number; contentType: string; body: string };

function reponseApi(url: URL): unknown {
	switch (url.pathname) {
		case "/api/orgs":
			return ORGS;
		case "/api/sources":
			return [];
		case "/api/events":
			return EVENTS;
		case "/api/graph":
			return { nodes: [], links: [] };
		case "/api/flows":
			return { arcs: [] };
		case "/api/na/overview":
			return {
				depts: [],
				derniereCollecte: null,
				total: { orgs: ORGS.length, orgsAvecEvenement: ORGS.length, evenements: EVENTS.length, deptsSansEvenement: [] },
			};
		case "/api/na/events":
			return { dept: url.searchParams.get("dept"), events: [] };
		default:
			return {};
	}
}

async function installeReseau(context: BrowserContext, baseURL: string, etat: { offline: boolean }) {
	const ressources = new Map<string, Ressource>();

	await context.addInitScript(() => {
		try {
			localStorage.setItem("radar_token", "jeton-de-test");
		} catch {
			// stockage indisponible : le test échouera sur l'écran de connexion
		}
	});

	await context.route("**/*", async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname.startsWith("/api/")) {
			if (etat.offline) return route.abort("internetdisconnected");
			if (url.pathname === "/api/stream") {
				return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
			}
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(reponseApi(url)),
			});
		}

		// Le serveur de développement tombe hors de portée avec le réseau :
		// on rejoue exactement les fichiers déjà servis pendant la phase en ligne.
		if (url.origin !== baseURL) return route.abort();
		if (etat.offline) {
			const ressource = ressources.get(request.url());
			return ressource
				? route.fulfill(ressource)
				: route.abort("internetdisconnected");
		}

		const reponse = await route.fetch();
		const ressource: Ressource = {
			status: reponse.status(),
			contentType: reponse.headers()["content-type"] ?? "application/octet-stream",
			body: await reponse.text(),
		};
		ressources.set(request.url(), ressource);
		return route.fulfill(ressource);
	});
}

test("la carte garde ses organisations et son indicateur hors ligne après rechargement", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, baseURL!, etat);

	await page.goto("/#/map");
	await expect(page.locator(".shell")).toBeVisible();
	await expect.poll(() => page.evaluate(() => {
		const brut = localStorage.getItem("radar:instantane:carte");
		if (brut === null) return 0;
		const parsed: unknown = JSON.parse(brut);
		if (parsed === null || typeof parsed !== "object" || !("data" in parsed)) return 0;
		const data: unknown = parsed.data;
		if (data === null || typeof data !== "object" || !("orgs" in data)) return 0;
		return Array.isArray(data.orgs) ? data.orgs.length : 0;
	})).toBeGreaterThanOrEqual(10);

	// On visite aussi la vue région en ligne : son chunk chargé à la demande
	// sera disponible hors ligne, où il servira à compter les organisations.
	await page.getByRole("button", { name: "Nouvelle-Aquitaine" }).click();
	await page.locator('button.na-ligne[data-dept="33"]').click();
	await expect.poll(() => page.locator("button.na-ligne-org").count()).toBeGreaterThanOrEqual(10);
	await page.getByRole("button", { name: /toute la région/ }).click();
	await page.getByRole("button", { name: "Carte" }).click();

	// Un instantané tout frais est volontairement présenté comme « à jour » :
	// on le vieillit pour observer l'état « hors ligne » revendiqué par l'UI.
	await page.evaluate(() => {
		const cle = "radar:instantane:carte";
		const parsed: unknown = JSON.parse(localStorage.getItem(cle) ?? "null");
		if (parsed === null || typeof parsed !== "object" || !("at" in parsed) || typeof parsed.at !== "number") {
			throw new Error("aucun instantané exploitable en mémoire");
		}
		parsed.at = Date.now() - 45 * 60_000;
		localStorage.setItem(cle, JSON.stringify(parsed));
	});

	etat.offline = true;
	await context.setOffline(true);
	await page.reload();

	const indicateur = page.locator("p.shell__offline");
	await expect(indicateur).toBeVisible();
	await expect(indicateur).toHaveAttribute("data-etat", "perime");
	await expect(indicateur).toContainText("hors ligne");

	await page.getByRole("button", { name: "Nouvelle-Aquitaine" }).click();
	await page.locator('button.na-ligne[data-dept="33"]').click();
	await expect.poll(() => page.locator("button.na-ligne-org").count()).toBeGreaterThanOrEqual(10);
});
