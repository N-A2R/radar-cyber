/**
 * F4 : les promesses d'attente du service worker gardent leur sémantique,
 * mais ne doivent pas laisser d'écouteur actif après le délai de 2 s.
 * `main.tsx` est importé avec un rendu et un catalogue mockés : seul le
 * branchement du SW est observé.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

type Ecouteur = (...arguments_: unknown[]) => void;
type Inscription = { type: string; ecouteur: Ecouteur };

class CibleEvenements {
	readonly ajoutes: Inscription[] = [];
	readonly retires: Inscription[] = [];
	private readonly ecouteurs = new Map<string, Set<Ecouteur>>();

	addEventListener(type: string, ecouteur: Ecouteur): void {
		this.ajoutes.push({ type, ecouteur });
		const liste = this.ecouteurs.get(type) ?? new Set<Ecouteur>();
		liste.add(ecouteur);
		this.ecouteurs.set(type, liste);
	}

	removeEventListener(type: string, ecouteur: Ecouteur): void {
		this.retires.push({ type, ecouteur });
		this.ecouteurs.get(type)?.delete(ecouteur);
	}

	declenche(type: string): void {
		for (const ecouteur of this.ecouteurs.get(type) ?? []) ecouteur();
	}
}

vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: () => {} }) }));
vi.mock("../src/App", () => ({ default: () => null }));
vi.mock("@astryxdesign/core", () => ({
	InternationalizationProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("@astryxdesign/core/locales/fr-FR.generated.js", () => ({ default: {} }));

let conteneur: CibleEvenements;
let enregistrement: CibleEvenements;
let registre: Mock;
let descriptorSW: PropertyDescriptor | undefined;
let descriptorEtat: PropertyDescriptor | undefined;

beforeEach(async () => {
	vi.resetModules();
	vi.useFakeTimers();
	conteneur = new CibleEvenements();
	enregistrement = new CibleEvenements();
	registre = vi.fn(async () => ({
		active: null,
		addEventListener: enregistrement.addEventListener.bind(enregistrement),
		removeEventListener: enregistrement.removeEventListener.bind(enregistrement),
	}));
	descriptorSW = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
	descriptorEtat = Object.getOwnPropertyDescriptor(document, "readyState");
	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: {
			controller: null,
			addEventListener: conteneur.addEventListener.bind(conteneur),
			removeEventListener: conteneur.removeEventListener.bind(conteneur),
			register: registre,
		},
	});
	Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });

	// Import dynamique volontaire : le module enregistre le SW au chargement,
	// il faut d'abord installer les fakes sur navigator/document.
	await import("../src/main");
	window.dispatchEvent(new Event("load"));
	await vi.advanceTimersByTimeAsync(0);
});

afterEach(() => {
	if (descriptorSW) Object.defineProperty(navigator, "serviceWorker", descriptorSW);
	else Reflect.deleteProperty(navigator, "serviceWorker");
	if (descriptorEtat) Object.defineProperty(document, "readyState", descriptorEtat);
	else Reflect.deleteProperty(document, "readyState");
	vi.useRealTimers();
});

describe("enregistrement du service worker", () => {
	it("retire updatefound et controllerchange quand les délais expirent", async () => {
		expect(registre).toHaveBeenCalledWith("/radar-sw.js", { scope: "/" });
		await vi.advanceTimersByTimeAsync(2000);
		await vi.advanceTimersByTimeAsync(2000);
		expect(enregistrement.retires.map((inscription) => inscription.type)).toContain("updatefound");
		expect(conteneur.retires.map((inscription) => inscription.type)).toContain("controllerchange");
		expect(conteneur.ajoutes.filter((inscription) => inscription.type === "controllerchange")).toHaveLength(1);
	});

	it("retire controllerchange dès que l'événement arrive", async () => {
		await vi.advanceTimersByTimeAsync(2000);
		conteneur.declenche("controllerchange");
		await vi.advanceTimersByTimeAsync(0);
		expect(conteneur.retires.map((inscription) => inscription.type)).toContain("controllerchange");
		await vi.advanceTimersByTimeAsync(2000);
	});
});
