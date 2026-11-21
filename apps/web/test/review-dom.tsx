/**
 * File de revue — test d'interaction en DOM (jsdom).
 *
 * Le rendu statique ne prouve pas qu'une frappe déclenche la bonne décision.
 * Ici on monte le composant, on intercepte `fetch`, on tape au clavier et on
 * vérifie **ce qui part vers l'API** : bons identifiants, bonne action, motif
 * obligatoire, annulation. Aucune base n'est touchée.
 *
 *   pnpm -F @radar/web run test:dom
 */
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import type { ReviewQueueResponse, ReviewRow } from "../src/api";

// React décide à l'évaluation du module s'il tourne dans un DOM. Les imports
// statiques étant hissés, on installe jsdom d'abord, puis on charge React et le
// composant dynamiquement — sinon React part sur ses replis « hors navigateur ».
type ReactModule = typeof import("react");
type DomModule = typeof import("react-dom/client");
type ViewModule = typeof import("../src/components/QuarantineReviewView");
let act: ReactModule["act"];
let createRoot: DomModule["createRoot"];
let ReviewView: ViewModule["default"];

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
	url: "http://localhost/",
	pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// Node 22 expose `navigator` en lecture seule : on redéfinit la propriété.
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = dom.window.requestAnimationFrame;
g.cancelAnimationFrame = dom.window.cancelAnimationFrame;
g.IS_REACT_ACT_ENVIRONMENT = true;

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
	checks++;
	if (ok) console.log(`OK   ${label}`);
	else {
		failures++;
		console.error(`FAIL ${label}`, detail === undefined ? "" : detail);
	}
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
let queueStatus = 200;
let actionStatus = 200;
let unauthorized = 0;

function row(id: number, hint: string, bucket: "chaud" | "tiede" | "froid", score: number): ReviewRow {
	return {
		id, source: "jeu-test", sourceUrl: "https://exemple.test/a", groupe: "lockbit3",
		orgHint: hint, claimedAt: "2025-01-05T00:00:00Z", receivedAt: "2026-11-10T00:00:00Z",
		tlp: "RED", status: "pending", promoted: false, promotedBy: null, promotedAt: null,
		hasDescription: false,
		triage: {
			score, bucket, suggested: bucket === "froid" ? "reject" : "review",
			reasons: [{ label: "pays déclaré : France", weight: 25 }],
			declaredCountry: "France", domainOnly: false, disagreement: false,
			referentialGap: bucket !== "froid",
		},
		org: id === 11 ? { id: 7, name: "Commune de Pessac", kind: "commune", city: "Pessac" } : null,
		orgConfidence: id === 11 ? 0.85 : null,
		review: [],
	};
}

const payload: ReviewQueueResponse = {
	rows: [row(11, "Commune de Pessac", "tiede", 43), row(12, "acme.com", "froid", 4), row(13, "autre.fr", "froid", 2)],
	total: 3, page: 0, limit: 50, window: 500, truncated: false,
	facets: { source: [{ value: "jeu-test", count: 3 }], groupe: [], bucket: [{ value: "tiede", count: 1 }, { value: "froid", count: 2 }], status: [] },
	counts: { pending: 3, reviewed: 0, rejected: 0, promoted: 0 },
	tookMs: 12,
};

g.fetch = async (input: string, init?: { method?: string; body?: string }) => {
	const url = String(input);
	const method = init?.method ?? "GET";
	calls.push({ url, method, body: init?.body ? JSON.parse(init.body) as Record<string, unknown> : null });
	if (url.includes("/quarantine/queue")) {
		return { ok: queueStatus === 200, status: queueStatus, json: async () => payload };
	}
	if (url.includes("/quarantine/review")) {
		return {
			ok: actionStatus === 200, status: actionStatus,
			json: async () => ({ action: "reject", requested: 1, changed: 1, promoted: 0, alerts: 0, skipped: [] }),
		};
	}
	throw new Error(`appel inattendu : ${url}`);
};

const container = dom.window.document.getElementById("root")!;
let root: Root;

async function flush(): Promise<void> {
	await act(async () => { await Promise.resolve(); });
	await act(async () => { await Promise.resolve(); });
}

function press(key: string, shiftKey = false, target?: Element): void {
	const node = target ?? container.querySelector(".review")!;
	act(() => {
		node.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
	});
}

function lastAction(): Call | undefined {
	return [...calls].reverse().find((call) => call.url.includes("/quarantine/review"));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text)) as HTMLButtonElement | undefined;
}

async function main(): Promise<void> {
	const react = await import("react");
	const reactDom = await import("react-dom/client");
	const view = await import("../src/components/QuarantineReviewView");
	act = react.act;
	createRoot = reactDom.createRoot;
	ReviewView = view.default;

	await act(async () => {
		root = createRoot(container);
		root.render(<ReviewView canWrite server onUnauthorized={() => { unauthorized++; }} onOpenOrg={() => {}} />);
	});
	await flush();

	check("monte et charge la file", container.querySelectorAll(".review__item").length === 3);
	check("affiche le compteur d'attente", (container.querySelector(".review__tally")?.textContent ?? "").includes("en attente"));
	check("détail du premier fait visible", (container.querySelector(".review__detail")?.textContent ?? "").includes("Pessac"));
	check("trace du score affichée", (container.querySelector(".review__reasons")?.textContent ?? "").includes("pays déclaré"));
	check("trou du référentiel signalé", container.querySelector(".review__gap") !== null);

	// --- navigation -------------------------------------------------------
	press("j");
	await flush();
	check("J déplace le fait courant", container.querySelectorAll(".review__item")[1].getAttribute("data-active") === "true");
	check("le détail suit la navigation", (container.querySelector(".review__detail h2")?.textContent ?? "") === "acme.com");
	press("k");
	await flush();
	check("K revient en arrière", container.querySelectorAll(".review__item")[0].getAttribute("data-active") === "true");

	// --- décision sur le fait courant -------------------------------------
	calls.length = 0;
	press("p");
	await flush();
	const promoted = lastAction();
	check("P envoie une promotion du fait courant", promoted?.body?.action === "promote" && JSON.stringify(promoted?.body?.ids) === "[11]", promoted?.body);
	check("un bandeau de résultat apparaît", container.querySelector(".review__toast") !== null);

	// --- sélection multiple ----------------------------------------------
	press("x");
	press("j");
	press("x");
	await flush();
	check("X coche deux faits", (container.querySelector(".review__selection")?.textContent ?? "").includes("2"));
	calls.length = 0;
	press("p");
	await flush();
	check("la décision porte sur toute la sélection", JSON.stringify(lastAction()?.body?.ids) === "[11,12]", lastAction()?.body);
	press("Escape");
	await flush();
	check("Échap vide la sélection", (container.querySelector(".review__selection")?.textContent ?? "").includes("fait courant"));

	// --- rejet : motif obligatoire ---------------------------------------
	calls.length = 0;
	press("r");
	await flush();
	const motif = container.querySelector("#review-motif") as HTMLInputElement | null;
	check("R ouvre la saisie du motif", motif !== null);
	check("confirmation désactivée sans motif", buttonByText("Confirmer")?.disabled === true);
	press("p", false, motif!);
	await flush();
	check("aucune promotion pendant la saisie du motif", lastAction() === undefined);

	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
		setter?.call(motif, "hors périmètre régional");
		motif!.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await flush();
	check("confirmation activée avec motif", buttonByText("Confirmer")?.disabled === false);
	await act(async () => { buttonByText("Confirmer")!.click(); });
	await flush();
	const rejected = lastAction();
	check("le rejet part avec son motif", rejected?.body?.action === "reject" && rejected?.body?.reason === "hors périmètre régional", rejected?.body);
	check("la saisie se referme après décision", container.querySelector("#review-motif") === null);

	// --- annulation depuis le bandeau ------------------------------------
	calls.length = 0;
	const undo = [...container.querySelectorAll(".review__toast button")].find((b) => b.textContent === "Annuler") as HTMLButtonElement | undefined;
	check("le bandeau propose une annulation", undo !== undefined);
	await act(async () => { undo?.click(); });
	await flush();
	check(
		"l'annulation porte exactement sur les faits de la décision annulée",
		lastAction()?.body?.action === "undo" && JSON.stringify(lastAction()?.body?.ids) === JSON.stringify(rejected?.body?.ids),
		{ undo: lastAction()?.body, decision: rejected?.body },
	);

	// --- lecture seule ---------------------------------------------------
	await act(async () => { root.unmount(); });
	calls.length = 0;
	await act(async () => {
		root = createRoot(container);
		root.render(<ReviewView canWrite={false} server onUnauthorized={() => { unauthorized++; }} onOpenOrg={() => {}} />);
	});
	await flush();
	press("p");
	await flush();
	check("lecture seule : le clavier ne décide pas", lastAction() === undefined);
	check("lecture seule : message explicite", (container.textContent ?? "").includes("Lecture seule"));

	// --- 401 -------------------------------------------------------------
	queueStatus = 401;
	await act(async () => { root.unmount(); });
	await act(async () => {
		root = createRoot(container);
		root.render(<ReviewView canWrite server onUnauthorized={() => { unauthorized++; }} onOpenOrg={() => {}} />);
	});
	await flush();
	check("401 : la session est signalée à l'application", unauthorized > 0);
	check("401 : l'erreur est affichée", container.querySelector(".review__error") !== null);
	queueStatus = 200;

	// --- hors ligne ------------------------------------------------------
	await act(async () => { root.unmount(); });
	calls.length = 0;
	await act(async () => {
		root = createRoot(container);
		root.render(<ReviewView canWrite={false} server={false} onUnauthorized={() => {}} onOpenOrg={() => {}} />);
	});
	await flush();
	check("mode démonstration : aucun appel réseau", calls.length === 0);

	await act(async () => { root.unmount(); });
	console.log(`\n${checks - failures}/${checks} contrôles d'interaction.`);
	if (failures > 0) {
		console.error(`${failures} contrôle(s) en échec.`);
		process.exitCode = 1;
	} else {
		console.log("Tous les contrôles passent.");
	}
	dom.window.close();
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
	dom.window.close();
});
