/**
 * État de l'application dans l'URL — liens profonds partageables.
 *
 * Quatre destinations : Carte, Action, Sources, Journal. Les anciennes vues
 * restent partageables : `#/couverture`, `#/review` ou `#/health` sont lus
 * puis réécrits vers la destination et le panneau/onglet qui les contient,
 * sans perdre leurs filtres.
 *
 * Format : `#/<destination>?<paramètres>`. Le hash plutôt que la pathname :
 * aucun serveur à configurer, aucun risque de 404 au rechargement, et le dépôt
 * n'embarque pas de routeur pour si peu.
 *
 * Fonctions pures : testables sans navigateur.
 */

export const VIEWS = ["map", "action", "sources", "journal"] as const;
export type ViewId = (typeof VIEWS)[number];

/** Panneaux de la Carte : un lien direct ouvre le bon panneau. */
export const MAP_PANELS = ["carte", "couverture", "regional", "affected", "graph", "directory", "attributions"] as const;
export type MapPanel = (typeof MAP_PANELS)[number];
export const DEFAULT_MAP_PANEL: MapPanel = "carte";

/** Onglets de la destination Action. */
export const ACTION_TABS = ["alerts", "review"] as const;
export type ActionTab = (typeof ACTION_TABS)[number];
export const DEFAULT_ACTION_TAB: ActionTab = "alerts";

/** Onglets de la destination Sources. */
export const SOURCES_TABS = ["registre", "indicateurs", "sante", "corpus"] as const;
export type SourcesTab = (typeof SOURCES_TABS)[number];
export const DEFAULT_SOURCES_TAB: SourcesTab = "registre";

/** Onglets de la destination Journal. */
export const JOURNAL_TABS = ["journal", "dossier"] as const;
export type JournalTab = (typeof JOURNAL_TABS)[number];
export const DEFAULT_JOURNAL_TAB: JournalTab = "journal";

/** Filtres de la file de revue, portés par l'URL (`#/action?bucket=…&q=…`). */
export const REVUE_BUCKETS = ["chaud", "tiede", "froid"] as const;
export type RevueBucket = (typeof REVUE_BUCKETS)[number];
export type ReviewUrlState = { bucket: RevueBucket | ""; q: string };
export const DEFAULT_REVIEW: ReviewUrlState = { bucket: "", q: "" };

function isRevueBucket(value: string | null): value is RevueBucket {
	return value !== null && (REVUE_BUCKETS as readonly string[]).includes(value);
}

function oneOf<T extends string>(values: readonly T[], value: string | null, fallback: T): T {
	return value !== null && (values as readonly string[]).includes(value) ? value as T : fallback;
}

/** Filtres hérités du feuil « Aujourd'hui », conservés pour les liens anciens. */
export type TodayUrlState = { family: string | null; dept: string | null };
export type DirectoryUrlState = {
	q: string;
	kind: string | null;
	sector: string | null;
	dept: string | null;
	withEvents: boolean;
	/** Les organisations jamais vues : le trou, pas le bruit. */
	withoutEvents: boolean;
	sort: string;
	dir: "asc" | "desc";
	page: number;
	size: number;
};

export type AppUrlState = {
	view: ViewId;
	/** Panneau ouvert dans la Carte. */
	mapPanel: MapPanel;
	/** Onglet ouvert dans Action. */
	actionTab: ActionTab;
	/** Onglet ouvert dans Sources. */
	sourcesTab: SourcesTab;
	/** Onglet ouvert dans Journal. */
	journalTab: JournalTab;
	directory: DirectoryUrlState;
	/** Fiche organisation ouverte, pour un lien direct. */
	org: number | null;
	/** Filtres de l'ancien écran d'accueil (`family`, `dept`). */
	today: TodayUrlState;
	/** Département sélectionné dans le panneau régional. */
	naDept: string | null;
	/** Filtres de la file de revue (`bucket`, `q`). */
	review: ReviewUrlState;
};
export const DEFAULT_TODAY: TodayUrlState = { family: null, dept: null };

export const DEFAULT_DIRECTORY: DirectoryUrlState = {
	q: "",
	kind: null,
	sector: null,
	dept: null,
	withEvents: false,
	withoutEvents: false,
	// Tri par défaut : les organisations touchées d'abord. C'est un poste de
	// veille, pas un annuaire alphabétique.
	sort: "eventCount",
	dir: "desc",
	page: 0,
	size: 50,
};

export const DEFAULT_STATE: AppUrlState = {
	// La Carte est l'accueil : c'est la vue qui ouvre le poste de veille.
	view: "map",
	mapPanel: DEFAULT_MAP_PANEL,
	actionTab: DEFAULT_ACTION_TAB,
	sourcesTab: DEFAULT_SOURCES_TAB,
	journalTab: DEFAULT_JOURNAL_TAB,
	directory: DEFAULT_DIRECTORY,
	today: DEFAULT_TODAY,
	review: DEFAULT_REVIEW,
	org: null,
	naDept: null,
};

const SIZES = [25, 50, 100, 200];

function isView(value: string | null): value is ViewId {
	return value !== null && (VIEWS as readonly string[]).includes(value);
}

type LegacyRoute = {
	view: ViewId;
	mapPanel?: MapPanel;
	actionTab?: ActionTab;
	sourcesTab?: SourcesTab;
	journalTab?: JournalTab;
};

/**
 * Anciens noms encore partageables. Chaque alias précise la destination et
 * le panneau/onglet qui contient désormais l'ancien écran.
 */
const LEGACY_ROUTES: Record<string, LegacyRoute> = {
	today: { view: "map", mapPanel: "carte" },
	aujourdhui: { view: "map", mapPanel: "carte" },
	coverage: { view: "map", mapPanel: "couverture" },
	couverture: { view: "map", mapPanel: "couverture" },
	na: { view: "map", mapPanel: "regional" },
	affected: { view: "map", mapPanel: "affected" },
	graph: { view: "map", mapPanel: "graph" },
	directory: { view: "map", mapPanel: "directory" },
	attributions: { view: "map", mapPanel: "attributions" },
	review: { view: "action", actionTab: "review" },
	alerts: { view: "action", actionTab: "alerts" },
	"sources-dashboard": { view: "sources", sourcesTab: "indicateurs" },
	health: { view: "sources", sourcesTab: "sante" },
	corpus: { view: "sources", sourcesTab: "corpus" },
	dossier: { view: "journal", journalTab: "dossier" },
};

export function parseHash(hash: string): AppUrlState {
	const clean = hash.replace(/^#\/?/, "");
	const [path, search = ""] = clean.split("?");
	const params = new URLSearchParams(search);
	// `#/sources` et `#/journal` sont des destinations : leur `?tab=` fait foi.
	const legacy = isView(path) ? undefined : LEGACY_ROUTES[path];

	let view: ViewId;
	let mapPanel: MapPanel;
	let actionTab: ActionTab;
	let sourcesTab: SourcesTab;
	let journalTab: JournalTab;
	if (legacy) {
		view = legacy.view;
		mapPanel = legacy.mapPanel ?? DEFAULT_MAP_PANEL;
		actionTab = legacy.actionTab ?? DEFAULT_ACTION_TAB;
		sourcesTab = legacy.sourcesTab ?? DEFAULT_SOURCES_TAB;
		journalTab = legacy.journalTab ?? DEFAULT_JOURNAL_TAB;
	} else {
		view = isView(path) ? path : DEFAULT_STATE.view;
		mapPanel = oneOf(MAP_PANELS, params.get("panel"), DEFAULT_MAP_PANEL);
		actionTab = oneOf(ACTION_TABS, params.get("tab"), DEFAULT_ACTION_TAB);
		sourcesTab = oneOf(SOURCES_TABS, params.get("tab"), DEFAULT_SOURCES_TAB);
		journalTab = oneOf(JOURNAL_TABS, params.get("tab"), DEFAULT_JOURNAL_TAB);
	}

	const size = Number(params.get("size"));
	const page = Number(params.get("page"));
	const org = Number(params.get("org"));
	const dept = params.get("dept");
	const sort = params.get("sort") ?? "";
	const family = params.get("family");
	const naDept = params.get("naDept");
	const bucket = params.get("bucket");
	const tabParam = params.get("tab");

	if (!legacy) {
		// Le paramètre `tab` est interprété dans la destination ouverte.
		if (view === "action") actionTab = oneOf(ACTION_TABS, tabParam, DEFAULT_ACTION_TAB);
		if (view === "sources") sourcesTab = oneOf(SOURCES_TABS, tabParam, DEFAULT_SOURCES_TAB);
		if (view === "journal") journalTab = oneOf(JOURNAL_TABS, tabParam, DEFAULT_JOURNAL_TAB);
	}
	if (view !== "map") mapPanel = DEFAULT_MAP_PANEL;
	if (view !== "action") actionTab = DEFAULT_ACTION_TAB;
	if (view !== "sources") sourcesTab = DEFAULT_SOURCES_TAB;
	if (view !== "journal") journalTab = DEFAULT_JOURNAL_TAB;

	return {
		view,
		mapPanel,
		actionTab,
		sourcesTab,
		journalTab,
		today: {
			family: family && /^[A-Za-z0-9_-]{1,64}$/.test(family) ? family : null,
			dept: dept && /^[0-9ABab]{2,3}$/.test(dept) ? dept : null,
		},
		review: {
			bucket: isRevueBucket(bucket) ? bucket : "",
			q: params.get("q") ?? "",
		},
		org: Number.isInteger(org) && org > 0 ? org : null,
		naDept: naDept && /^[0-9]{2}$/.test(naDept) ? naDept : null,
		directory: {
			q: params.get("q") ?? "",
			kind: params.get("kind") || null,
			sector: params.get("sector") || null,
			dept: dept && /^[0-9ABab]{2,3}$/.test(dept) ? dept : null,
			withEvents: params.get("events") === "1",
			withoutEvents: params.get("sans") === "1",
			sort: ["name", "eventCount", "city", "dept", "relevance"].includes(sort)
				? sort
				: DEFAULT_DIRECTORY.sort,
			dir: params.has("dir")
				? (params.get("dir") === "asc" ? "asc" : "desc")
				: DEFAULT_DIRECTORY.dir,
			page: Number.isInteger(page) && page > 0 ? Math.min(1000, page) : 0,
			size: SIZES.includes(size) ? size : DEFAULT_DIRECTORY.size,
		},
	};
}

/** Sérialise en omettant les valeurs par défaut : une URL courte se partage. */
export function toHash(state: AppUrlState): string {
	const params = new URLSearchParams();
	if (state.view === "map") {
		if (state.mapPanel !== DEFAULT_MAP_PANEL) params.set("panel", state.mapPanel);
		if (state.today.family) params.set("family", state.today.family);
		const d = state.directory;
		if (d.q) params.set("q", d.q);
		if (d.kind) params.set("kind", d.kind);
		if (d.sector) params.set("sector", d.sector);
		if (d.dept) params.set("dept", d.dept);
		else if (state.today.dept) params.set("dept", state.today.dept);
		if (d.withEvents) params.set("events", "1");
		if (d.withoutEvents) params.set("sans", "1");
		if (d.sort && d.sort !== DEFAULT_DIRECTORY.sort) params.set("sort", d.sort);
		if (d.dir !== DEFAULT_DIRECTORY.dir) params.set("dir", d.dir);
		if (d.page > 0) params.set("page", String(d.page));
		if (d.size !== DEFAULT_DIRECTORY.size) params.set("size", String(d.size));
	}
	if (state.view === "action") {
		if (state.actionTab !== DEFAULT_ACTION_TAB) params.set("tab", state.actionTab);
		if (state.review.bucket) params.set("bucket", state.review.bucket);
		if (state.review.q) params.set("q", state.review.q);
	}
	if (state.view === "sources" && state.sourcesTab !== DEFAULT_SOURCES_TAB) {
		params.set("tab", state.sourcesTab);
	}
	if (state.view === "journal" && state.journalTab !== DEFAULT_JOURNAL_TAB) {
		params.set("tab", state.journalTab);
	}
	if (state.org !== null) params.set("org", String(state.org));
	if (state.naDept) params.set("naDept", state.naDept);
	const search = params.toString();
	return `#/${state.view}${search ? `?${search}` : ""}`;
}

/** URL absolue à partager, indépendamment de l'endroit où l'on se trouve. */
export function shareableUrl(state: AppUrlState, origin: string, pathname = "/"): string {
	return `${origin}${pathname}${toHash(state)}`;
}
