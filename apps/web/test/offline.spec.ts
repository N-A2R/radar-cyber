import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

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
				contactNom: "Marie Confidentielle",
			};
		case "/api/quarantine/queue":
			return {
				rows: [], total: 0, page: 1, limit: 50, window: 30, truncated: false,
				facets: { source: [], groupe: [], bucket: [], status: [] },
				counts: { pending: 0, reviewed: 0, rejected: 0, promoted: 0 }, tookMs: 1,
			};
		case "/api/journal/review":
			return { rows: [], limite: 50, avant: null };
		case "/api/dossier":
			return {
				etat: {
					organisations: ORGS.length, sources: 3, sourcesActives: 3, sourcesMuettes: 0,
					evenements: EVENTS.length, evenements30j: EVENTS.length, indicateurs: 0,
					alertes: 0, journalEvenements: 0, archives: 0, regles: 0, migrations: 0,
					derniereMigration: null, domainesConnus: 1,
				},
				dossier: { genere: "2026-11-22T08:00:00Z", sections: [] },
			};
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

async function installeReseau(context: BrowserContext, origine: string, etat: { offline: boolean }) {
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

		// La fixture baseURL (donc PLAYWRIGHT_BASE_URL) donne l'origine réelle :
		// on ne rejoue que ses ressources, jamais une origine tierce.
		if (url.origin !== origine) return route.abort();
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

const RAIL = ["Carte", "Action", "Sources", "Journal"] as const;
type RailView = (typeof RAIL)[number];
const VIEW_ID: Record<RailView, string> = {
	Carte: "map", Action: "action", Sources: "sources", Journal: "journal",
};

type Step = { kind: "radio" | "tab"; group: string; name: string };
type Destination = {
	label: string;
	view: RailView;
	steps?: readonly Step[];
	shell: string;
	data?: { selector: string; text: string };
};

const CARTE_TAB: Step = { kind: "radio", group: "Panneau de la Carte", name: "Carte" };
const REGION: Destination = {
	label: "Carte · Région",
	view: "Carte",
	steps: [CARTE_TAB, { kind: "radio", group: "Panneau régional", name: "Région" }],
	shell: ".na-view",
	data: { selector: ".na-totaux", text: "12 organisations" },
};

/** Les anciens écrans sont aujourd'hui des panneaux ou des onglets du rail. */
const DESTINATIONS: readonly Destination[] = [
	{ label: "Carte", view: "Carte", shell: ".map-workspace" },
	REGION,
	{
		label: "Carte · Couverture",
		view: "Carte",
		steps: [CARTE_TAB, { kind: "radio", group: "Panneau régional", name: "Couverture" }],
		shell: ".coverage",
		data: { selector: ".coverage__hero-number", text: "80" },
	},
	{
		label: "Carte · Graphe",
		view: "Carte",
		steps: [{ kind: "radio", group: "Panneau de la Carte", name: "Graphe" }],
		shell: ".gv-root",
	},
	{
		label: "Carte · Organisations",
		view: "Carte",
		steps: [{ kind: "radio", group: "Panneau de la Carte", name: "Organisations" }],
		shell: ".directory",
	},
	{
		label: "Action · Alertes",
		view: "Action",
		steps: [{ kind: "tab", group: "Action", name: "Alertes" }],
		shell: ".alerts",
	},
	{
		label: "Action · Revue",
		view: "Action",
		steps: [{ kind: "tab", group: "Action", name: "Revue" }],
		shell: ".revue",
	},
	{
		label: "Sources · Registre",
		view: "Sources",
		steps: [{ kind: "tab", group: "Panneaux des sources", name: "Registre" }],
		shell: ".sources-view",
	},
	{
		label: "Sources · Indicateurs",
		view: "Sources",
		steps: [{ kind: "tab", group: "Panneaux des sources", name: "Indicateurs" }],
		shell: ".sws-dashboard",
	},
	{
		label: "Sources · Santé",
		view: "Sources",
		steps: [{ kind: "tab", group: "Panneaux des sources", name: "Santé" }],
		shell: ".health-view",
	},
	{
		label: "Sources · Corpus",
		view: "Sources",
		steps: [{ kind: "tab", group: "Panneaux des sources", name: "Corpus" }],
		shell: ".corpus__panel",
		data: { selector: '.corpus__panel:has-text("Sources par département")', text: "3 sources" },
	},
	{
		label: "Journal · Journal",
		view: "Journal",
		steps: [{ kind: "tab", group: "Sections du journal", name: "Journal" }],
		shell: ".journal",
	},
	{
		label: "Journal · Dossier",
		view: "Journal",
		steps: [{ kind: "tab", group: "Sections du journal", name: "Dossier" }],
		shell: ".dossier",
	},
];

async function openView(page: Page, view: RailView) {
	// Plus de menu d'application : les quatre destinations sont des liens
	// directs du rail, et leurs écrans d'origine sont des onglets/panneaux.
	await page.locator(".rail__nav").getByRole("link", { name: view }).click();
	await expect(page.locator(".shell")).toHaveAttribute("data-view", VIEW_ID[view]);
}

async function selectStep(page: Page, step: Step) {
	const collection = step.kind === "radio"
		? page.getByRole("radiogroup", { name: step.group })
		: page.getByRole("tablist", { name: step.group });
	const control = step.kind === "radio"
		? collection.getByRole("radio", { name: step.name, exact: true })
		: collection.getByRole("tab", { name: step.name, exact: true });
	await control.click();
}

async function visit(page: Page, destination: Destination) {
	await openView(page, destination.view);
	for (const step of destination.steps ?? []) await selectStep(page, step);
	await expect(page.locator(destination.shell).first(), destination.label).toBeVisible({ timeout: 15_000 });
	if (destination.data) {
		await expect(page.locator(destination.data.selector).first(), destination.label)
			.toContainText(destination.data.text, { timeout: 15_000 });
	}
}

/** Clés de l'index du cache PWA, décodées pour lisibilité. */
async function cachedPaths(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const brut = localStorage.getItem("radar:pwa:index");
		if (brut === null) return [];
		try {
			const parsed: unknown = JSON.parse(brut);
			if (!Array.isArray(parsed)) return [];
			return parsed.flatMap((entry): string[] => (
				entry !== null && typeof entry === "object" && "key" in entry && typeof entry.key === "string"
					? [decodeURIComponent(entry.key)]
					: []
			));
		} catch {
			return [];
		}
	});
}

async function cachedValue(page: Page, path: string): Promise<unknown> {
	return page.evaluate((key) => {
		const brut = localStorage.getItem(`radar:pwa:entry:${encodeURIComponent(key)}`);
		if (brut === null) return null;
		try { return JSON.parse(brut); } catch { return null; }
	}, path);
}

test("la barre contient les vues dans l'ordre du produit", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, new URL(baseURL!).origin, etat);
	await page.goto("/");
	await expect(page.locator(".shell")).toBeVisible();
	const labels = await page.locator(".rail__nav button, .rail__nav a").evaluateAll((elements) =>
		elements
			.filter((element) => !element.closest('[role="menu"]'))
			.map((element) => element.textContent?.trim() ?? "")
			.filter((label) => label && !/^(Fermer le popover|Close popover)$/.test(label)),
	);
	expect(labels).toEqual([...RAIL]);
});

test("la carte garde ses organisations et son indicateur hors ligne après rechargement", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, new URL(baseURL!).origin, etat);

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

	// On visite aussi le panneau régional en ligne : son chunk chargé à la
	// demande sera disponible hors ligne, où il servira à compter les organisations.
	await visit(page, REGION);
	await page.locator('button.na-ligne[data-dept="33"]').click();
	await expect.poll(() => page.locator("button.na-ligne-org").count()).toBeGreaterThanOrEqual(10);
	await page.getByRole("button", { name: /toute la région/ }).click();
	await visit(page, DESTINATIONS[0]);

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

	await visit(page, REGION);
	await page.locator('button.na-ligne[data-dept="33"]').click();
	await expect.poll(() => page.locator("button.na-ligne-org").count()).toBeGreaterThanOrEqual(10);
});

test("chaque destination rejoue coquille et données du cache après la panne réseau", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, new URL(baseURL!).origin, etat);

	await page.goto("/");
	await expect(page.locator(".shell")).toBeVisible();
	const enLigne: string[] = [];
	for (const destination of DESTINATIONS) {
		await visit(page, destination);
		enLigne.push(destination.label);
	}
	expect(enLigne).toEqual(DESTINATIONS.map((destination) => destination.label));

	// Les données des quatre destinations sont bien sur disque, mais jamais
	// les files de modération ni les identités : le cache est public et daté.
	const cheminCache = await cachedPaths(page);
	for (const chemin of ["/orgs", "/events", "/sources", "/alerts", "/corpus/stats", "/health/detail", "/couverture", "/na/overview"]) {
		expect(cheminCache.some((cle) => cle === chemin || cle.startsWith(`${chemin}?`)), `cache missing ${chemin}`)
			.toBe(true);
	}
	for (const chemin of cheminCache) {
		expect(chemin.split("?")[0], `confidential route cached: ${chemin}`)
			.not.toMatch(/^\/(journal|quarantine|auth|dossier|rectifications)(\/|$)/);
	}
	expect(JSON.stringify(await cachedValue(page, "/corpus/stats"))).not.toContain("Marie Confidentielle");

	etat.offline = true;
	await context.setOffline(true);
	await page.reload();
	await expect(page.locator(".shell")).toBeVisible();
	await expect(page.locator("p.shell__offline")).toContainText("Offline ·");

	const horsLigne: string[] = [];
	for (const destination of DESTINATIONS) {
		await visit(page, destination);
		horsLigne.push(destination.label);
	}
	expect(horsLigne).toEqual(enLigne);
});

test("les onglets conservent le focus clavier après la bascule hors ligne", async ({ page, context, baseURL }) => {
	const etat = { offline: false };
	await installeReseau(context, new URL(baseURL!).origin, etat);

	await page.goto("/#/sources");
	await expect(page.locator(".sws")).toBeVisible();
	await openView(page, "Action");
	await expect(page.locator(".alerts")).toBeVisible();
	await openView(page, "Journal");
	await expect(page.locator(".journal-workspace")).toBeVisible();
	await openView(page, "Sources");

	etat.offline = true;
	await context.setOffline(true);
	await page.reload();
	await expect(page.locator(".shell")).toBeVisible();

	await openView(page, "Sources");
	const registre = page.getByRole("tab", { name: "Registre", exact: true });
	await registre.focus();
	await expect(registre).toBeFocused();
	await page.keyboard.press("ArrowRight");
	const indicateurs = page.getByRole("tab", { name: "Indicateurs", exact: true });
	await expect(indicateurs).toBeFocused();
	await expect(indicateurs).toHaveAttribute("aria-selected", "true");
	await expect(page.locator(".sws-dashboard")).toBeVisible();

	await openView(page, "Action");
	const alertes = page.getByRole("tab", { name: "Alertes", exact: true });
	await alertes.focus();
	await page.keyboard.press("End");
	const revue = page.getByRole("tab", { name: "Revue", exact: true });
	await expect(revue).toBeFocused();
	await expect(revue).toHaveAttribute("aria-selected", "true");
	await expect(page.locator(".revue")).toBeVisible();
	await page.keyboard.press("Home");
	await expect(alertes).toBeFocused();
	await expect(page.locator(".alerts")).toBeVisible();

	await openView(page, "Journal");
	const journal = page.getByRole("tab", { name: "Journal", exact: true });
	await journal.focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("tab", { name: "Dossier", exact: true })).toBeFocused();
	await expect(page.locator(".dossier")).toBeVisible();
});

