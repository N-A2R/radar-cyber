/**
 * Vérification de l'écran d'accueil, sans navigateur.
 *
 * Les deux lignes et les compteurs ci-dessous sont des valeurs de
 * démonstration, pas un relevé figé : la ligne de base des organisations
 * reliées a changé avec les 20 créations du lot domaines (2026-11-21).
 */
import { renderToStaticMarkup } from "react-dom/server";
import TodayView, { triRecents } from "../src/components/TodayView";
import { DEFAULT_STATE, parseHash, toHash } from "../src/url-state";
import type { TodayEvent, TodayResponse } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

const ligneNonRattachee: TodayEvent = {
	id: "121517",
	titre: "FBI hacked again; criminal information database targeted",
	famille: "leaks",
	severite: 2,
	date: "2026-11-21 13:37:22+01",
	dateSource: "observee",
	source: "DataBreaches.net — flux des fuites de données",
	url: "https://databreaches.net/2026/11/21/fbi-hacked-again-criminal-information-database-targeted/",
	orgId: null,
	organisation: null,
	dept: null,
};
const ligneRattachee: TodayEvent = {
	id: "118380",
	titre: "Polynésie française : à bord d’un Falcon 50 de la Marine nationale",
	famille: "cti",
	severite: 2,
	date: "2026-11-21 12:00:00+01",
	dateSource: "observee",
	source: "Sud Ouest (RSS)",
	url: "https://www.sudouest.fr/environnement/mer/",
	orgId: 2123591,
	organisation: "A BORD ..",
	dept: "17",
};

const compteurs = { evenements24h: 693, organisations7j: 7, derniereCollecte: "2026-11-21 14:31:57.387627+01" };
const donnees: TodayResponse = {
	compteurs,
	// Mélangé à dessein : l'écran doit trier lui-même, pas faire confiance à l'ordre reçu.
	evenements: [ligneRattachee, ligneNonRattachee],
};

const html = renderToStaticMarkup(
	<TodayView data={donnees} loading={false} error={null} family={null} dept={null} departements={[]}
		onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);

check("une ligne réelle s'affiche", html.includes("FBI hacked again")
	&& html.includes("non rattaché")
	&& html.includes("DataBreaches.net")
	&& html.includes("leaks"));
check("date lisible et horodatage machine", html.includes("2026-11-21 12:37 UTC") && /datetime="2026-11-21 13:37:22\+01"/i.test(html));
check("lien source réel", html.includes("https://databreaches.net/2026/11/21/fbi-hacked-again-criminal-information-database-targeted/"));
check("compteurs affichés tels que reçus", html.includes(String(compteurs.evenements24h)) && html.includes(String(compteurs.organisations7j)));
check("tri décroissant", html.indexOf("FBI hacked again") < html.indexOf("Polynésie française"),
	`ordre : ${triRecents(donnees.evenements).map((e) => e.id).join(", ")}`);

const sansDonnees = renderToStaticMarkup(
	<TodayView data={null} loading error={null} family={null} dept={null} departements={[]}
		onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);
check("aucun chiffre inventé avant la réponse", sansDonnees.includes("—") && !sansDonnees.includes("693"));

const vide = renderToStaticMarkup(
	<TodayView data={{ compteurs, evenements: [] }} loading={false} error={null} family="leaks" dept="33" departements={[]}
		onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);
check("état vide explicite", vide.includes("Aucun incident sur cette période"));
check("filtres actifs rappelés dans l'état vide", vide.includes("famille « leaks »") && vide.includes("département 33"));

const filtre = parseHash("#/today?family=leaks&dept=33");
check("filtres lus dans l'URL", filtre.view === "today" && filtre.today.family === "leaks" && filtre.today.dept === "33");
check("filtres écrits dans l'URL",
	toHash({ ...DEFAULT_STATE, view: "today", today: { family: "leaks", dept: "33" } }) === "#/today?family=leaks&dept=33");
check("filtre invalide neutralisé", parseHash("#/today?family=<script>&dept=zzz").today.family === null
	&& parseHash("#/today?family=<script>&dept=zzz").today.dept === null);

const filtreRendu = renderToStaticMarkup(
	<TodayView data={donnees} loading={false} error={null} family="leaks" dept="33" departements={[]}
		onFamily={() => {}} onDept={() => {}} onOpenOrg={() => {}} onOpenEvent={() => {}} />,
);
check("le filtre s'applique au rendu", filtreRendu.includes('value="leaks"') && filtreRendu.includes('value="33"'));
check("l'état vide n'apparaît pas avec des lignes", !html.includes("Aucun incident sur cette période"));

console.log(failures === 0 ? "\nAujourd'hui : tous les contrôles passent." : `\nAujourd'hui : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
