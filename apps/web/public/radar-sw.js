/*
 * Service worker de la carte radar.
 *
 * Règle d'or : ne jamais toucher à /api/. Ce sont des données dynamiques,
 * authentifiées, et un cache d'API afficherait des millions d'organisations
 * périmées comme si elles étaient fraîches. La persistance des données passe
 * par IndexedDB (voir src/offline.ts), pas par ici.
 *
 * Ce worker ne garde que trois choses : le shell de l'application, ses assets
 * (modules Vite compris) et un nombre borné de tuiles de fond de carte.
 */

const PREFIX = "radar-offline-v1";
const CACHE_SHELL = `${PREFIX}-shell`;
const CACHE_ASSETS = `${PREFIX}-assets`;
const CACHE_TILES = `${PREFIX}-tiles`;
const RACINE = "/";
const MAX_TILES = 300;
const MAX_ASSETS = 800;

const HOTES_TUILES = new Set([
	"tile.openstreetmap.org",
	"data.geopf.fr",
	"tiles.openfreemap.org",
	"s3.amazonaws.com",
	"fonts.googleapis.com",
	"fonts.gstatic.com",
	"unpkg.com",
]);

/** Écrit une réponse en bornant le cache : les entrées les plus anciennes partent. */
async function ecrireBorné(cache, requete, reponse, limite) {
	await cache.put(requete, reponse.clone());
	const cles = await cache.keys();
	for (let i = 0; i < cles.length - limite; i += 1) {
		await cache.delete(cles[i]);
	}
}

async function mettreEnCache(cache, requete, reponse, limite) {
	if (reponse && (reponse.ok || reponse.type === "opaque")) {
		try {
			await ecrireBorné(cache, requete, reponse, limite);
		} catch {
			// Quota ou réponse non clonable : on garde la réseau, pas le cache.
		}
	}
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_SHELL);
			try {
				const reponse = await fetch(RACINE, { cache: "reload" });
				if (reponse.ok) {
					await cache.put(RACINE, reponse.clone());
					await cache.put("/index.html", reponse.clone());
				}
			} catch {
				// Premier chargement sans réseau : le shell sera précaché par la
				// page dès que le réseau revient (message RADAR_PRECACHE_URLS).
			}
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const noms = await caches.keys();
			const courants = [CACHE_SHELL, CACHE_ASSETS, CACHE_TILES];
			await Promise.all(
				noms
					.filter((nom) => nom.startsWith("radar-offline-") && !courants.includes(nom))
					.map((nom) => caches.delete(nom)),
			);
			await self.clients.claim();
		})(),
	);
});

/** Tuiles et polices : cache-first, rafraîchies en arrière-plan. */
function tuiles(requete, event) {
	return (async () => {
		const cache = await caches.open(CACHE_TILES);
		const memo = await cache.match(requete);
		const maj = fetch(requete)
			.then(async (reponse) => {
				await mettreEnCache(cache, requete, reponse, MAX_TILES);
				return reponse;
			})
			.catch(() => null);
		if (memo) {
			event.waitUntil(maj);
			return memo;
		}
		const reponse = await maj;
		if (reponse) return reponse;
		throw new Error("tuile indisponible hors ligne");
	})();
}

/** Navigation : réseau d'abord, shell précaché en repli. */
async function navigation(requete) {
	const cache = await caches.open(CACHE_SHELL);
	try {
		const reponse = await fetch(requete);
		if (reponse.ok) {
			try {
				await cache.put(RACINE, reponse.clone());
				await cache.put("/index.html", reponse.clone());
			} catch {
				// Le shell précaché à l'installation reste valable.
			}
		}
		return reponse;
	} catch {
		return (
			(await cache.match(RACINE)) ??
			(await cache.match("/index.html")) ??
			new Response("Application indisponible hors ligne", {
				status: 503,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			})
		);
	}
}

/** Assets same-origin (y compris /src/* et /@vite/*) : stale-while-revalidate. */
function asset(requete, event) {
	return (async () => {
		const cache = await caches.open(CACHE_ASSETS);
		const memo = await cache.match(requete);
		const maj = fetch(requete).then(async (reponse) => {
			await mettreEnCache(cache, requete, reponse, MAX_ASSETS);
			return reponse;
		});
		if (memo) {
			event.waitUntil(maj.catch(() => {}));
			return memo;
		}
		return maj;
	})();
}

self.addEventListener("fetch", (event) => {
	const requete = event.request;
	if (requete.method !== "GET") return;
	let url;
	try {
		url = new URL(requete.url);
	} catch {
		return;
	}
	// Données dynamiques : laissées intégralement au réseau, sans exception.
	if (url.pathname.startsWith("/api/")) return;
	if (HOTES_TUILES.has(url.hostname)) {
		event.respondWith(tuiles(requete, event));
		return;
	}
	if (url.origin === self.location.origin) {
		if (requete.mode === "navigate") {
			event.respondWith(navigation(requete));
		} else {
			event.respondWith(asset(requete, event));
		}
	}
});

/**
 * La page connaît ses modules mieux que le worker : au premier chargement,
 * les requêtes ont eu lieu avant l'installation du SW et n'ont donc pas été
 * vues par le handler `fetch`. On lui transmet la liste (performance API) pour
 * que le JS soit réellement disponible avant une coupure réseau, y compris sur
 * le serveur Vite de développement.
 */
self.addEventListener("message", (event) => {
	const donnees = event.data;
	if (!donnees || donnees.type !== "RADAR_PRECACHE_URLS" || !Array.isArray(donnees.urls)) return;
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_ASSETS);
			for (const brut of donnees.urls.slice(0, MAX_ASSETS)) {
				try {
					const url = new URL(brut, self.location.origin);
					if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) continue;
					const requete = new Request(url.href, { cache: "reload" });
					const reponse = await fetch(requete);
					await mettreEnCache(cache, requete, reponse, MAX_ASSETS);
				} catch {
					// Une ressource manquante ne doit pas empêcher les autres.
				}
			}
		})(),
	);
});
