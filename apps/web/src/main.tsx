import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

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
			const fin = setTimeout(() => resolve(navigator.serviceWorker.controller), 2000);
			navigator.serviceWorker.addEventListener(
				"controllerchange",
				() => {
					clearTimeout(fin);
					resolve(navigator.serviceWorker.controller);
				},
				{ once: true },
			);
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
						const fin = setTimeout(resolve, 2000);
						enregistrement.addEventListener(
							"updatefound",
							() => {
								clearTimeout(fin);
								resolve();
							},
							{ once: true },
						);
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
