/*
 * Service worker for the radar application shell.
 *
 * Golden rule: never touch /api/. Dynamic data is cached client-side by the
 * allowlist in src/offline/pwa.ts, where it can be redacted, bounded and dated.
 * This worker keeps the application shell, its assets (Vite modules included)
 * and a bounded number of raster tiles and glyphs so a cold reload works
 * offline. TileJSON documents are deliberately NOT cached: they must fail
 * offline so the map can switch to its embedded fallback style.
 */

const RACINE = "/";
const PREFIX = "radar-offline-v2";
const CACHE_SHELL = `${PREFIX}-shell`;
const CACHE_ASSETS = `${PREFIX}-assets`;
const CACHE_TILES = `${PREFIX}-tiles`;
const CACHE_GLYPHS = `${PREFIX}-glyphs`;
const SHELL_URLS = [RACINE, "/index.html", "/manifest.webmanifest", "/icon.svg"];
const MAX_TILES = 300;
const MAX_ASSETS = 800;
const MAX_GLYPHS = 80;
/** Ressources cartographiques : cache-first, rafraîchies en arrière-plan. */
function cacheFirst(requete, event, nomCache, limite, message) {
	return (async () => {
		const cache = await caches.open(nomCache);
		const memo = await cache.match(requete);
		const maj = fetch(requete)
			.then(async (reponse) => {
				await mettreEnCache(cache, requete, reponse, limite);
				return reponse;
			})
			.catch(() => null);
		if (memo) {
			event.waitUntil(maj);
			return memo;
		}
		const reponse = await maj;
		if (reponse) return reponse;
		throw new Error(message);
	})();
}

function tuiles(requete, event) {
	return cacheFirst(requete, event, CACHE_TILES, MAX_TILES, "tuile indisponible hors ligne");
}

function glyphes(requete, event) {
	return cacheFirst(requete, event, CACHE_GLYPHS, MAX_GLYPHS, "police indisponible hors ligne");
}

/** Navigation : réseau d'abord, shell précaché en repli, puis 503 explicite. */
async function navigation(requete) {
	let cache = null;
	try {
		cache = await caches.open(CACHE_SHELL);
	} catch {
		// Cache indisponible : le réseau reste tenté, le 503 reste possible.
	}
	try {
		const reponse = await fetch(requete);
		if (reponse.ok && cache) {
			try {
				await cache.put(RACINE, reponse.clone());
				await cache.put("/index.html", reponse.clone());
			} catch {
				// Le shell précaché à l'installation reste valable.
			}
		}
		return reponse;
	} catch {
		if (cache) {
			try {
				const shell = (await cache.match(RACINE)) ?? (await cache.match("/index.html"));
				if (shell) return shell;
			} catch {
				// Lecture impossible : on tombe sur la réponse de repli.
			}
		}
		return new Response("Application indisponible hors ligne", {
			status: 503,
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	}
}


const HOTES_TUILES = new Set([
	"tile.openstreetmap.org",
	"data.geopf.fr",
	"tiles.openfreemap.org",
	"s3.amazonaws.com",
]);

// Polices et glyphes MapLibre : budget propre, une police ne doit pas évincer
// les tuiles raster ni inversement.
const HOTES_GLYPHS = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "unpkg.com"]);
const EXTENSION_TUILE = /\.(png|jpe?g|webp|avif|pbf|mvt)(?:$|\?)/i;

/**
 * Le TileJSON d'OpenFreeMap est `/planet` (sans extension) : le mettre en
 * cache-first servirait un style pointant vers des tuiles non cachées et
 * empêcherait `degrade()` de recevoir l'échec réseau. On le laisse donc
 * toujours passer au réseau, y compris hors ligne.
 */
function estDocumentTuiles(url) {
	return url.hostname === "tiles.openfreemap.org"
		&& (url.pathname === "/planet" || url.pathname.endsWith(".json") || !EXTENSION_TUILE.test(url.pathname));
}

function estGlyphe(url) {
	return HOTES_GLYPHS.has(url.hostname) || url.pathname.includes("/fonts/");
}


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
			await Promise.all(
				SHELL_URLS.map(async (url) => {
					try {
						const reponse = await fetch(url, { cache: "reload" });
						if (reponse.ok) await cache.put(url, reponse.clone());
					} catch {
						// Shell URLs are retried on the next controlled navigation.
					}
				}),
			);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const noms = await caches.keys();
			const courants = [CACHE_SHELL, CACHE_ASSETS, CACHE_TILES, CACHE_GLYPHS];
			await Promise.all(
				noms
					.filter((nom) => nom.startsWith("radar-offline-") && !courants.includes(nom))
					.map((nom) => caches.delete(nom)),
			);
			await self.clients.claim();
		})(),
	);
});

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
	if (HOTES_TUILES.has(url.hostname) || HOTES_GLYPHS.has(url.hostname) || estGlyphe(url)) {
		// Un TileJSON périmé ne doit jamais masquer le repli carte hors ligne.
		if (estDocumentTuiles(url)) {
			event.respondWith(fetch(requete));
			return;
		}
		event.respondWith(
			estGlyphe(url) ? glyphes(requete, event) : tuiles(requete, event),
		);
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
