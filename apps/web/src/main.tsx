// Design system Astryx : la cascade doit s'exécuter avant le graphe de
// modules de l'app — les feuilles des composants s'injectent après ces
// déclarations, jamais avant le reset ni les variables du thème.
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-stone/fonts.css";
import "@astryxdesign/theme-stone/theme.css";
// Feuille de base MapLibre : servie localement par Vite, donc disponible
// hors ligne. Elle précède le pont `styles.css`, dernière cascade Astryx.
import "maplibre-gl/dist/maplibre-gl.css";
import { InternationalizationProvider } from "@astryxdesign/core";
import frFR from "@astryxdesign/core/locales/fr-FR.generated.js";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <InternationalizationProvider locale="fr-FR" messages={{ "fr-FR": frFR }}>
    <App />
  </InternationalizationProvider>,
);

/**
 * Le service worker est enregistré en dev comme en prod : c'est ce qui permet
 * de recharger l'app hors ligne sur le serveur Vite. Un échec (navigation
 * privée, origine non sécurisée) est silencieux — l'app reste utilisable avec
 * son instantané IndexedDB/localStorage.
 */
function enregistrerServiceWorker(): void {
	if (!("serviceWorker" in navigator)) return;

	const urlSet = (): string[] =>
		performance
			.getEntriesByType("resource")
			.map((entree) => entree.name)
			.filter((nom) => {
				try {
					const url = new URL(nom, window.location.href);
					return url.origin === window.location.origin && !url.pathname.startsWith("/api/");
				} catch {
					return false;
				}
			});

	const attendreControle = (): Promise<ServiceWorker | null> => {
		if (navigator.serviceWorker.controller) return Promise.resolve(navigator.serviceWorker.controller);
		return new Promise((resolve) => {
			// Même callback pour les deux API : le timeout retire bien l'écouteur.
			const terminer = () => {
				clearTimeout(fin);
				navigator.serviceWorker.removeEventListener("controllerchange", terminer);
				resolve(navigator.serviceWorker.controller);
			};
			const fin = setTimeout(terminer, 2000);
			navigator.serviceWorker.addEventListener("controllerchange", terminer, { once: true });
		});
	};

	const demarrer = () => {
		navigator.serviceWorker
			.register("/radar-sw.js", { scope: "/" })
			.then(async (enregistrement) => {
				// Les modules chargés avant l'installation du SW ne sont pas passés
				// par son handler fetch : on les lui transmet explicitement.
				if (!enregistrement.active && !navigator.serviceWorker.controller) {
					await new Promise<void>((resolve) => {
						const terminer = () => {
							clearTimeout(fin);
							enregistrement.removeEventListener("updatefound", terminer);
							resolve();
						};
						const fin = setTimeout(terminer, 2000);
						enregistrement.addEventListener("updatefound", terminer, { once: true });
					});
				}
				const contrôleur = (await attendreControle()) ?? enregistrement.active;
				contrôleur?.postMessage({ type: "RADAR_PRECACHE_URLS", urls: urlSet() });
			})
			.catch(() => {});
	};

	if (document.readyState === "complete") demarrer();
	else window.addEventListener("load", demarrer, { once: true });
}

enregistrerServiceWorker();
