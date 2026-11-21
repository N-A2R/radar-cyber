/**
 * État de l'application dans l'URL — liens profonds partageables.
 *
 * Le poste n'avait aucun état d'URL : impossible d'envoyer à un collègue
 * « l'annuaire filtré sur la Gironde, page 3, fiche de Pessac ouverte ». Un
 * rechargement ramenait toujours à la carte.
 *
 * Format : `#/<vue>?<paramètres>`. Le hash plutôt que la pathname : aucun
 * serveur à configurer, aucun risque de 404 au rechargement, et le dépôt
 * n'embarque pas de routeur pour si peu.
 *
 * Fonctions pures : testables sans navigateur.
 */

export const VIEWS = ["today", "map", "directory", "review", "graph", "sources", "health", "alerts", "dossier", "na"] as const;
export type ViewId = (typeof VIEWS)[number];


/** Filtres de l'écran d'accueil, portés par l'URL pour être partageables. */
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
	directory: DirectoryUrlState;
	/** Fiche organisation ouverte, pour un lien direct. */
	org: number | null;
	/** Filtres de l'écran « Aujourd'hui » (`#/today?family=…&dept=…`). */
	today: TodayUrlState;
	/** Vue Nouvelle-Aquitaine : département sélectionné, `null` = toute la région. */
	naDept: string | null;
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
	// Le matin, on ouvre l'actualité du jour — pas la carte.
	view: "today",
	directory: DEFAULT_DIRECTORY,
	today: DEFAULT_TODAY,
	org: null,
	naDept: null,
};

const SIZES = [25, 50, 100, 200];

function isView(value: string | null): value is ViewId {
	return value !== null && (VIEWS as readonly string[]).includes(value);
}

export function parseHash(hash: string): AppUrlState {
	const clean = hash.replace(/^#\/?/, "");
	const [path, search = ""] = clean.split("?");
	const params = new URLSearchParams(search);
	const view = isView(path) ? path : DEFAULT_STATE.view;

	const size = Number(params.get("size"));
	const page = Number(params.get("page"));
	const org = Number(params.get("org"));
	const dept = params.get("dept");
	const sort = params.get("sort") ?? "";
	const family = params.get("family");
	const naDept = params.get("naDept");

	return {
		view,
		today: {
			family: family && /^[A-Za-z0-9_-]{1,64}$/.test(family) ? family : null,
			dept: dept && /^[0-9ABab]{2,3}$/.test(dept) ? dept : null,
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
	const d = state.directory;
	if (state.view === "today") {
		if (state.today.family) params.set("family", state.today.family);
		if (state.today.dept) params.set("dept", state.today.dept);
	}
	if (state.view === "directory") {
		if (d.q) params.set("q", d.q);
		if (d.kind) params.set("kind", d.kind);
		if (d.sector) params.set("sector", d.sector);
		if (d.dept) params.set("dept", d.dept);
		if (d.withEvents) params.set("events", "1");
		if (d.withoutEvents) params.set("sans", "1");
		if (d.sort && d.sort !== DEFAULT_DIRECTORY.sort) params.set("sort", d.sort);
		if (d.dir !== DEFAULT_DIRECTORY.dir) params.set("dir", d.dir);
		if (d.page > 0) params.set("page", String(d.page));
		if (d.size !== DEFAULT_DIRECTORY.size) params.set("size", String(d.size));
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
