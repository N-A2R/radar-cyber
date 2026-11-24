/**
 * Spec du service worker : le fichier publié est exécuté dans un `new Function`
 * dont les globals sont des paramètres. Rien n'est écrit sur `globalThis`,
 * chaque test repart d'un monde neuf ; `afterEach` libère les références.
 */
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import source from "../public/radar-sw.js?raw";

const ORIGINE = "https://radar.test";
const SHELL = "radar-offline-v2-shell";
const ASSETS = "radar-offline-v2-assets";
const TILES = "radar-offline-v2-tiles";
const GLYPHS = "radar-offline-v2-glyphs";

class FauxResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly type = "default";
	readonly headers: Record<string, string>;

	constructor(
		private readonly corps: string,
		options: { status?: number; headers?: Record<string, string> } = {},
	) {
		this.status = options.status ?? 200;
		this.ok = this.status >= 200 && this.status < 300;
		this.headers = options.headers ?? {};
	}

	clone(): FauxResponse {
		return new FauxResponse(this.corps, { status: this.status, headers: this.headers });
	}

	async text(): Promise<string> {
		return this.corps;
	}
}

class FauxRequest {
	readonly method: string;
	readonly mode: string;

	constructor(
		readonly url: string,
		init: { method?: string; mode?: string } = {},
	) {
		this.method = init.method ?? "GET";
		this.mode = init.mode ?? "cors";
	}
}

type Requete = FauxRequest | string;

function cleDe(requete: Requete): string {
	return typeof requete === "string" ? new URL(requete, ORIGINE).href : requete.url;
}

class CacheMemoire {
	readonly entrees = new Map<string, FauxResponse>();
	readonly recherches: string[] = [];

	async match(requete: Requete): Promise<FauxResponse | null> {
		const cle = cleDe(requete);
		this.recherches.push(cle);
		return this.entrees.get(cle) ?? null;
	}

	async put(requete: Requete, reponse: FauxResponse): Promise<void> {
		this.entrees.set(cleDe(requete), reponse.clone());
	}

	async keys(): Promise<Array<{ url: string }>> {
		return Array.from(this.entrees.keys(), (url) => ({ url }));
	}

	async delete(requete: Requete | { url: string }): Promise<boolean> {
		return this.entrees.delete(cleDe(typeof requete === "string" ? requete : new FauxRequest(requete.url)));
	}
}

interface CachesMemoire {
	mapes: Map<string, CacheMemoire>;
	ouvertures: string[];
	suppressions: string[];
	open(nom: string): Promise<CacheMemoire>;
	keys(): Promise<string[]>;
	delete(nom: string): Promise<boolean>;
}

function creeCaches(): CachesMemoire {
	const mapes = new Map<string, CacheMemoire>();
	return {
		mapes,
		ouvertures: [] as string[],
		suppressions: [] as string[],
		async open(nom: string): Promise<CacheMemoire> {
			this.ouvertures.push(nom);
			let cache = mapes.get(nom);
			if (!cache) {
				cache = new CacheMemoire();
				mapes.set(nom, cache);
			}
			return cache;
		},
		async keys(): Promise<string[]> {
			return Array.from(mapes.keys());
		},
		async delete(nom: string): Promise<boolean> {
			this.suppressions.push(nom);
			return mapes.delete(nom);
		},
	};
}

type Ecouteur = (event: EvenementSW) => void;

type EvenementSW = {
	request?: FauxRequest;
	data?: unknown;
	respondWith?: (promesse: Promise<FauxResponse>) => void;
	waitUntil?: (promesse: Promise<unknown>) => void;
};
type Declenchement = { promesse: Promise<FauxResponse> | null };
type Monde = {
	declenche: (type: string, event: EvenementSW) => Promise<Declenchement>;
	caches: CachesMemoire;
	appelsFetch: string[];
	self: {
		skipWaiting: Mock;
		clients: { claim: Mock };
	};
};

function chargeMonde(network?: (requete: Requete, init?: unknown) => Promise<FauxResponse>): Monde {
	const ecouteurs = new Map<string, Ecouteur[]>();
	const self = {
		location: { origin: ORIGINE },
		addEventListener(type: string, ecouteur: Ecouteur) {
			const liste = ecouteurs.get(type) ?? [];
			liste.push(ecouteur);
			ecouteurs.set(type, liste);
		},
		skipWaiting: vi.fn(async () => {}),
		clients: { claim: vi.fn(async () => {}) },
	};
	const caches = creeCaches();
	const appelsFetch: string[] = [];
	// Le faux réseau se comporte comme fetch() : jamais d'exception synchrone
	// dans le handler, toujours une promesse que respondWith peut recevoir.
	const fetch = (requete: Requete, init?: unknown): Promise<FauxResponse> => {
		appelsFetch.push(cleDe(requete));
		const reseau: (requete: Requete, init?: unknown) => Promise<FauxResponse> =
			network ?? (async () => new FauxResponse("réponse du réseau"));
		try {
			return Promise.resolve(reseau(requete, init));
		} catch (erreur) {
			return Promise.reject(erreur);
		}
	};
	const globals: Record<string, unknown> = {
		self,
		caches,
		fetch,
		URL,
		Request: FauxRequest,
		Response: FauxResponse,
	};
	new Function(...Object.keys(globals), source)(...Object.values(globals));

	return {
		caches,
		appelsFetch,
		self,
		async declenche(type: string, evenement: EvenementSW): Promise<Declenchement> {
			let promesse: Promise<FauxResponse> | null = null;
			const attentes: Promise<unknown>[] = [];
			const event: EvenementSW = {
				...evenement,
				respondWith(p) {
					promesse = p;
					// Le test attachera son assertion sur p ; éviter une rejection
					// non gérée entre le handler et cette assertion.
					void p.catch(() => {});
				},
				waitUntil(p) { attentes.push(p); },
			};
			for (const ecouteur of ecouteurs.get(type) ?? []) ecouteur(event);
			await Promise.all(attentes);
			// Ne pas rendre la promesse elle-même : un async l'absorberait et
			// l'échec réseau serait lancé avant que le test ne l'observe.
			return { promesse };
		},
	};
}

afterEach(() => {
	// Le isolateur est local à chaque test : aucun global à restaurer.
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const navigation = (): FauxRequest => new FauxRequest(`${ORIGINE}/#/map`, { mode: "navigate" });

describe("radar-sw.js", () => {
	it("précache le shell à l'installation et publie le contrôle à l'activation", async () => {
		const monde = chargeMonde();
		monde.caches.mapes.set("radar-offline-v1-shell", new CacheMemoire());
		await monde.declenche("install", {});

		const shell = monde.caches.mapes.get(SHELL)!;
		for (const chemin of ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"]) {
			expect(shell.entrees.has(new URL(chemin, ORIGINE).href)).toBe(true);
		}
		expect(monde.self.skipWaiting).toHaveBeenCalledTimes(1);

		await monde.declenche("activate", {});
		expect(monde.caches.suppressions).toEqual(["radar-offline-v1-shell"]);
		expect(monde.self.clients.claim).toHaveBeenCalledTimes(1);
	});

	it("rejoue le shell précaché quand la navigation échoue réseau", async () => {
		const monde = chargeMonde(async () => { throw new Error("réseau coupé"); });
		const shell = await monde.caches.open(SHELL);
		await shell.put("/", new FauxResponse("shell précaché"));

		const { promesse } = await monde.declenche("fetch", { request: navigation() });
		expect(promesse).not.toBeNull();
		const reponse = await promesse!;
		expect(await reponse.text()).toBe("shell précaché");
		expect(shell.recherches).toContain(new URL("/", ORIGINE).href);
	});

	it("renvoie un 503 explicite si le réseau et le cache échouent", async () => {
		const monde = chargeMonde(async () => { throw new Error("réseau coupé"); });
		monde.caches.open = async () => { throw new Error("cache indisponible"); };

		const { promesse } = await monde.declenche("fetch", { request: navigation() });
		const reponse = await promesse!;
		expect(reponse.status).toBe(503);
		expect(await reponse.text()).toContain("indisponible hors ligne");
	});

	it("met à jour le shell après une navigation réussie", async () => {
		const monde = chargeMonde();
		const { promesse } = await monde.declenche("fetch", { request: navigation() });
		expect(await (await promesse!).text()).toBe("réponse du réseau");
		const shell = monde.caches.mapes.get(SHELL)!;
		expect(shell.entrees.has(new URL("/", ORIGINE).href)).toBe(true);
		expect(shell.entrees.has(new URL("/index.html", ORIGINE).href)).toBe(true);
	});

	it("laisse les appels /api/ au réseau, sans les intercepter", async () => {
		const monde = chargeMonde();
		let respondWith = false;
		await monde.declenche("fetch", {
			request: new FauxRequest(`${ORIGINE}/api/events`),
			respondWith() { respondWith = true; },
		});
		expect(respondWith).toBe(false);
	});

	it("sert une tuile raster depuis le cache hors ligne", async () => {
		const monde = chargeMonde(async () => { throw new Error("réseau coupé"); });
		const tuiles = await monde.caches.open(TILES);
		const url = "https://tile.openstreetmap.org/6/32/23.png";
		await tuiles.put(url, new FauxResponse("tuile"));

		const { promesse } = await monde.declenche("fetch", { request: new FauxRequest(url) });
		expect(await (await promesse!).text()).toBe("tuile");
	});

	it("ne sert jamais un TileJSON périmé : le repli carte doit voir l'échec", async () => {
		const monde = chargeMonde(async () => { throw new Error("réseau coupé"); });
		const tuiles = await monde.caches.open(TILES);
		await tuiles.put("https://tiles.openfreemap.org/planet", new FauxResponse("TileJSON périmé"));

		const { promesse } = await monde.declenche("fetch", {
			request: new FauxRequest("https://tiles.openfreemap.org/planet"),
		});
		expect(promesse).not.toBeNull();
		await expect(promesse!).rejects.toThrow("réseau coupé");
		expect(tuiles.recherches).toEqual([]);
		expect(monde.appelsFetch).toEqual(["https://tiles.openfreemap.org/planet"]);
	});

	it("met les glyphes dans un budget distinct des tuiles", async () => {
		const monde = chargeMonde();
		const { promesse } = await monde.declenche("fetch", {
			request: new FauxRequest("https://tiles.openfreemap.org/fonts/Open%20Sans%20Regular/0-255.pbf"),
		});
		await promesse!;
		expect(monde.caches.ouvertures).toContain(GLYPHS);
		expect(monde.caches.ouvertures).not.toContain(TILES);
	});

	it("reçoit la liste de pré-cache de la page sans toucher aux API ni aux CDN", async () => {
		const monde = chargeMonde();
		const { promesse } = await monde.declenche("message", {
			data: {
				type: "RADAR_PRECACHE_URLS",
				urls: [`${ORIGINE}/src/main.tsx`, `${ORIGINE}/api/events`, "https://unpkg.com/x.js"],
			},
		});
		expect(promesse).toBeNull();
		const assets = monde.caches.mapes.get(ASSETS)!;
		expect(assets.entrees.has(`${ORIGINE}/src/main.tsx`)).toBe(true);
		expect(assets.entrees.has(`${ORIGINE}/api/events`)).toBe(false);
		expect(assets.entrees.has("https://unpkg.com/x.js")).toBe(false);
	});
});
