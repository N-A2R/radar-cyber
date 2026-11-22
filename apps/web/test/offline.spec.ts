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
		case "/api/orgs/liees":
			return { semaine: 3, total: 12, enAttente: 1, examinees: 2, parDepartement: [{ dept: "33", n: 3 }] };
		case "/api/orgs/liees/historique":
			return { points: [{ jour: "2026-11-21", semaine: 3, total: 12, enAttente: 1, examinees: 2 }] };
		case "/api/review/queue":
			return { rows: [], total: 0, page: 1, limit: 50, window: 30, truncated: false, counts: {}, tookMs: 1 };
		case "/api/sources":
			return [];
		case "/api/events":
			return EVENTS;
		case "/api/graph":
		case "/api/graph/temporal":
			return { nodes: [], links: [] };
		case "/api/flows":
			return { arcs: [], total: 0, truncated: false };
		case "/api/na/overview":
			return {
				depts: [],
				derniereCollecte: null,
				total: { orgs: ORGS.length, orgsAvecEvenement: ORGS.length, evenements: EVENTS.length, deptsSansEvenement: [] },
			};
		case "/api/na/events":
			return { dept: url.searchParams.get("dept"), events: [] };
		case "/api/today":
			return {
				compteurs: { evenements24h: EVENTS.length, organisations7j: ORGS.length, derniereCollecte: "2026-11-22T08:00:00Z" },
				evenements: [],
			};
		case "/api/today/departements":
			return { departements: [{ dept: "33", evenements: EVENTS.length, organisations: ORGS.length }] };
		case "/api/couverture":
			return {
				dateCalcul: "2026-11-21T00:00:00Z", hashCorpus: "fixture",
				fenetre: { debut: "2026-10-22", fin: "2026-11-21" },
				global: { vus: 8, total: 10, taux: 80 },
				parMotif: [], parDepartement: [], parSecteur: [], parMois: [], stale: false,
			};
		case "/api/corpus/stats":
			return {
				generatedAt: "2026-11-22T08:00:00Z", windowHours: 24,
				totals: { sources: 3, sourcesLocalised: 3, organisations: ORGS.length, incidents: EVENTS.length },
				families: ["cyber"],
				byDepartment: [{ department: "33", label: "Gironde", total: 3, families: { cyber: 3 } }],
				domainCoverage: { withDomain: 1, organisations: ORGS.length, percent: 8 },
				sinceLastReport: {
					windowHours: 24, newEvents: 1, previousEvents: 0, change: 1,
					percentChange: null, comparedTo: "fixture",
				},
				recentIncidents: [],
			};
		case "/api/quarantine/queue":
			return {
				rows: [], total: 0, page: 1, limit: 50, window: 30, truncated: false,
				facets: { source: [], groupe: [], bucket: [], status: [] },
				counts: { pending: 0, reviewed: 0, rejected: 0, promoted: 0 }, tookMs: 1,
			};
		case "/api/journal/review":
			return { rows: [], limite: 50, avant: null };
		case "/api/health":
			return { ok: true, sources: [] };
		case "/api/health/detail":
			return {
				ok: true, generatedAt: "2026-11-22T08:00:00Z", windowDays: 7,
				sources: { declared: 3, enabled: 3, actives7j: 3, muettes7j: 0, bySource: [] },
				events24h: EVENTS.length, orgs7j: ORGS.length,
				queues: { pending: 0, reviewed: 0, promoted: 0 }, families: [],
			};
		case "/api/health/causes":
			return {
				ok: true, generatedAt: "2026-11-22T08:00:00Z", rouges: 0, sansTrace: 0,
				stockage: {
					causeStockee: false, explication: "fixture",
					champPropose: { table: "", colonne: "", definition: "" },
				},
				causes: [],
			};
		case "/api/collecte/metrics":
			return {
				generatedAt: "2026-11-22T08:00:00Z", fenetreHeures: 24,
				resume: {
					cycles: 1, cyclesEchoues: 0, dureeMoyenneMs: 1, dureeMaxMs: 1,
					sourcesOk: 3, sourcesError: 0, itemsIn: 3, itemsNew: 3, memoireMaxOctets: 1024,
				},
				cycles: [], alertes: [],
			};
		case "/api/alerts":
		case "/api/alerts/stats":
			return [];
		case "/api/directory":
			return {
				rows: ORGS.slice(0, 5), total: ORGS.length, page: 1, limit: 50,
				facets: { kind: [], sector: [], dept: [] }, truncated: false, tookMs: 1,
			};
		case "/api/search":
			return { orgs: [], events: [], indicators: [] };
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

		try {
			const reponse = await route.fetch();
			const ressource: Ressource = {
				status: reponse.status(),
				contentType: reponse.headers()["content-type"] ?? "application/octet-stream",
				body: await reponse.text(),
			};
			ressources.set(request.url(), ressource);
			await route.fulfill(ressource);
		} catch {
			// A navigation can dispose an in-flight response before it is read.
			// Fail that request fast; the next load fetches a fresh copy.
			await route.abort("failed").catch(() => {});
		}
	});
}

test("la barre contient les vues dans l'ordre du produit", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, baseURL!, etat);

	await page.goto("/");
	await expect(page.locator(".shell")).toBeVisible();

	// On lit les nœuds texte des boutons : le compteur d'alertes est un enfant
	// séparé et ne doit pas changer le libellé attendu.
	const labels = await page.locator(".rail__nav button").evaluateAll((buttons) =>
		buttons.map((button) =>
			Array.from(button.childNodes)
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent ?? "")
				.join("")
				.trim(),
		),
	);
	expect(labels).toEqual([
		"Today",
		"Coverage",
		"Review",
		"Journal",
		"Corpus",
		"Sources",
		"Map",
		"Graph",
		"Health",
		"Alerts",
		"Nouvelle-Aquitaine",
	]);
});

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
	await page.getByRole("button", { name: "Map" }).click();

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
	await expect(indicateur).toContainText("Offline ·");

	await page.getByRole("button", { name: "Nouvelle-Aquitaine" }).click();
	await page.locator('button.na-ligne[data-dept="33"]').click();
	await expect.poll(() => page.locator("button.na-ligne-org").count()).toBeGreaterThanOrEqual(10);
});

test("every product view replays from cache after the network is cut", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, baseURL!, etat);
	const vues: Array<[string, string]> = [
		["Today", ".today__compteurs"],
		["Coverage", ".coverage"],
		["Review", ".revue"],
		["Journal", ".journal"],
		["Corpus", ".corpus__panel"],
		["Sources", ".sources-view"],
		["Map", "canvas"],
		["Graph", ".gv-root"],
		["Health", ".sources"],
		["Alerts", ".alerts"],
		["Nouvelle-Aquitaine", ".na-view"],
	];

	await page.goto("/");
	await expect(page.locator(".shell")).toBeVisible();
	const enLigne: string[] = [];
	for (const [label, selecteur] of vues) {
		await page.locator(".rail__nav").getByRole("button", { name: label, exact: true }).click();
		await expect(page.locator(selecteur).first()).toBeVisible({ timeout: 8000 });
		enLigne.push(label);
	}
	expect(enLigne).toEqual(vues.map(([label]) => label));

	etat.offline = true;
	await context.setOffline(true);
	await page.reload();
	await expect(page.locator(".shell")).toBeVisible();
	await expect(page.locator("p.shell__offline")).toContainText("Offline ·");

	const horsLigne: string[] = [];
	for (const [label, selecteur] of vues) {
		await page.locator(".rail__nav").getByRole("button", { name: label, exact: true }).click();
		await expect(page.locator(selecteur).first()).toBeVisible({ timeout: 8000 });
		horsLigne.push(label);
	}
	expect(horsLigne).toEqual(enLigne);
});
