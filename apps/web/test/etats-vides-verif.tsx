/**
 * Test unitaire des états asynchrones partagés, sur trois composants réels.
 * Le DOM (jsdom) prouve aussi que le bouton de l'état vide déclenche bien
 * l'action fournie — un rendu statique ne le pourrait pas.
 *
 *   pnpm -F @radar/web run test:etats-vides
 */
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import { mockData } from "../src/mock";
import type { ReactElement } from "react";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
	url: "http://localhost/",
	pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = dom.window.requestAnimationFrame;
g.cancelAnimationFrame = dom.window.cancelAnimationFrame;
g.IS_REACT_ACT_ENVIRONMENT = true;

const container = dom.window.document.getElementById("root")!;
let root: Root | null = null;
let failures = 0;
let checks = 0;

function check(label: string, ok: boolean): void {
	checks++;
	console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
	if (!ok) failures++;
}

// React choisit son mode à l'évaluation du module : jsdom doit d'abord être
// installé, donc ces imports sont volontairement différés (cf. review-dom.tsx).


function skeletons(): number {
	return container.querySelectorAll(".skeleton__line").length;
}

function emptyButton(label: string): HTMLButtonElement | null {
	const state = container.querySelector(".empty-state");
	if (state === null) return null;
	return [...state.querySelectorAll("button")].find((b) => b.textContent === label) ?? null;
}

async function main(): Promise<void> {
	const react = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { default: EventList } = await import("../src/components/EventList");
	const { default: JournalListe } = await import("../src/components/JournalListe");
	const { default: SourcesView } = await import("../src/components/SourcesView");

	const act = react.act;
	async function render(node: ReactElement): Promise<void> {
		if (root !== null) await act(async () => root!.unmount());
		await act(async () => {
			root = createRoot(container);
			root.render(node);
		});
		await act(async () => { await Promise.resolve(); });
	}
	async function click(button: HTMLButtonElement | null): Promise<void> {
		if (button === null) return;
		await act(async () => { button.click(); });
	}

	let retries = 0;
	const onRetry = () => { retries++; };

	// 1. Fil d'événements --------------------------------------------------
	await render(<EventList events={[]} byFamily={[]} family={null} onFamily={() => {}}
		selectedEventId={null} onSelectEvent={() => {}} loading error={null} onRetry={onRetry} />);
	check("fil : 3 lignes de squelette pendant l'appel", skeletons() === 3);
	check("fil : libellé de chargement annoncé", container.querySelector(".skeleton__label")?.textContent === "chargement du fil");
	await render(<EventList events={[]} byFamily={[]} family={null} onFamily={() => {}}
		selectedEventId={null} onSelectEvent={() => {}} loading={false} error={null} onRetry={onRetry} />);
	check("fil : état vide explicite", container.querySelector(".empty-state__message")?.textContent === "Aucun événement dans ce fil.");
	check("fil : aucun squelette une fois chargé", skeletons() === 0);
	await click(emptyButton("Recharger le fil"));
	check("fil : l'action de l'état vide recharge", retries === 1);
	await render(<EventList events={[mockData.events[0]]} byFamily={[]} family={null} onFamily={() => {}}
		selectedEventId={null} onSelectEvent={() => {}} loading={false} error={null} onRetry={onRetry} />);
	check("fil : pas d'état vide avec des événements", container.querySelector(".empty-state") === null);

	// 2. Journal ------------------------------------------------------------
	await render(<JournalListe rows={[]} total={0} filters={{}} onFilterChange={() => {}} onReset={() => {}}
		loading error={null} page={1} pageCount={1} onPrevious={() => {}} onNext={() => {}}
		selected={null} onSelect={() => {}} onCloseDetail={() => {}} onExport={() => {}} exporting={false}
		exportError={null} onRetry={onRetry} />);
	check("journal : 3 lignes de squelette pendant l'appel", skeletons() === 3);
	check("journal : libellé de chargement annoncé",
		container.querySelector(".skeleton__label")?.textContent === "Chargement du journal…");
	await render(<JournalListe rows={[]} total={0} filters={{}} onFilterChange={() => {}} onReset={() => {}}
		loading={false} error={null} page={1} pageCount={1} onPrevious={() => {}} onNext={() => {}}
		selected={null} onSelect={() => {}} onCloseDetail={() => {}} onExport={() => {}} exporting={false}
		exportError={null} onRetry={onRetry} />);
	check("journal : état vide explicite", container.querySelector(".empty-state__message")?.textContent === "Aucune entrée de journal enregistrée pour l'instant.");
	check("journal : squelette retiré après chargement", skeletons() === 0);
	await click(emptyButton("Recharger le journal"));
	check("journal : l'action de l'état vide recharge", retries === 2);

	// 3. Registre des sources ----------------------------------------------
	await render(<SourcesView sources={[]} loading error={null} onRetry={onRetry} />);
	check("sources : 3 lignes de squelette pendant l'appel", skeletons() === 3);
	check("sources : libellé de chargement annoncé",
		container.querySelector(".skeleton__label")?.textContent === "chargement des sources…");
	await render(<SourcesView sources={[]} loading={false} error={null} onRetry={onRetry} />);
	check("sources : état vide explicite", container.querySelector(".empty-state__message")?.textContent === "aucune source déclarée");
	check("sources : squelette retiré après chargement", skeletons() === 0);
	await click(emptyButton("Recharger les sources"));
	check("sources : l'action de l'état vide recharge", retries === 3);
	await render(<SourcesView sources={mockData.sources} loading={false} error={null} onRetry={onRetry} />);
	check("sources : pas d'état vide avec des sources", container.querySelector(".empty-state") === null);

	await act(async () => { root!.unmount(); });
	console.log(`\n${checks - failures}/${checks} contrôles d'états asynchrones.`);
	if (failures > 0) process.exitCode = 1;
	dom.window.close();
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
	dom.window.close();
});
