/**
 * Vérification runtime de la vue Nouvelle-Aquitaine (Task 6, mission nuit NA).
 *
 * Ce que le typecheck ne voit pas : est-ce que les douze départements se
 * rendent ? Est-ce qu'un département filtré affiche son panneau ? Est-ce qu'un
 * département à zéro montre l'état vide honnête au lieu d'un écran blanc ? Le
 * filtre département survit-il à un aller-retour dans l'URL ?
 *
 *   pnpm -F @radar/web run test:na
 */
import { renderToStaticMarkup } from "react-dom/server";
import NaView, { overviewDepuisOrgs } from "../src/components/NaView";
import { parseHash, toHash, DEFAULT_STATE, type AppUrlState } from "../src/url-state";
import type { NaOverview, Org } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

function org(id: number, name: string, dept: string, eventCount: number): Org {
	return {
		id,
		name,
		slug: `org-${id}`,
		kind: "entreprise",
		sector: null,
		city: null,
		dept,
		domain: null,
		lat: null,
		lon: null,
		eventCount,
	};
}

/** Jeu d'exemple : Gironde touchée, Vienne touchée, Landes et Corrèze à zéro. */
const orgs: Org[] = [
	org(1, "Ville de Bordeaux", "33", 3),
	org(2, "Commune de La Teste de Buch", "33", 1),
	org(3, "CHU de Poitiers", "86", 2),
	org(4, "Mairie de Mont-de-Marsan", "40", 0),
	org(5, "Commune de Tulle", "19", 0),
];

const overview: NaOverview = overviewDepuisOrgs(orgs);

const baseProps = {
	orgs,
	overview,
	loading: false,
	error: null,
	dept: null,
	onSelectDept: () => {},
	onOpenOrg: () => {},
};

// 1. Rendu régional : douze départements et leurs comptes.
{
	const html = renderToStaticMarkup(<NaView {...baseProps} />);
	// La carte seule : douze <path class="na-dept">. La liste régionale ajoute
	// douze boutons data-dept — comptés séparément ci-dessous.
	const paths = (html.match(/<path class="na-dept/g) ?? []).length;
	check("douze départements rendus sur la carte", paths === 12, `${paths} paths`);
	const boutons = (html.match(/class="na-ligne" data-dept=/g) ?? []).length;
	check("douze lignes dans la liste régionale", boutons === 12, `${boutons} boutons`);
	check("totaux région affichés", html.includes("5 organisations") && html.includes("6 événements"), "");
	check(
		"départements à zéro écrits en clair",
		html.includes("départements à zéro") &&
			overview.total.deptsSansEvenement.includes("40") &&
			overview.total.deptsSansEvenement.includes("19"),
		JSON.stringify(overview.total.deptsSansEvenement),
	);
	check("Gironde affiche ses événements", html.includes("4 événements"), "");
}

// 2. Filtre département appliqué (Landes, à zéro).
{
	const html = renderToStaticMarkup(<NaView {...baseProps} dept="40" />);
	check("panneau du département affiché", html.includes("Landes (40)"), "");
	check(
		"état vide honnête pour un département à zéro",
		html.includes("Aucun événement sur ce département"),
		"",
	);
	check("le référentiel reste visible dans l'état vide", html.includes("référentiel"), "");
	check("liste régionale retirée quand un dept est filtré", !html.includes('class="na-ligne" data-dept'), "");
}

// 3. Filtre département avec organisations touchées (Gironde).
{
	const html = renderToStaticMarkup(<NaView {...baseProps} dept="33" />);
	check("Gironde : organisations touchées listées", html.includes("Ville de Bordeaux"), "");
	check("accès à la fiche organisation (bouton data-org)", html.includes('data-org="1"'), "");
	check("compteur d'organisations touchées", html.includes("2 organisation(s) touchée(s)"), "");
}

// 4. État vide honnête en mode chargement (ni carte fausse, ni écran blanc).
{
	const html = renderToStaticMarkup(
		<NaView orgs={[]} overview={null} loading={true} error={null} dept={null} onSelectDept={() => {}} onOpenOrg={() => {}} />,
	);
	check("chargement annoncé", html.includes("Chargement du référentiel Nouvelle-Aquitaine"), "");
}

// 5. Le filtre département persiste dans l'URL.
{
	const avecDept: AppUrlState = { ...DEFAULT_STATE, view: "na", naDept: "40" };
	const hash = toHash(avecDept);
	check("toHash sérialise naDept", hash === "#/na?naDept=40", hash);
	const lu = parseHash(hash);
	check("parseHash relit naDept", lu.naDept === "40" && lu.view === "na", JSON.stringify(lu.naDept));
	check("sans filtre, naDept vaut null", parseHash("#/na").naDept === null, "");
	check("naDept invalide ignoré", parseHash("#/na?naDept=abc").naDept === null, "");
}

// 6. Un overview serveur (API) est préféré au calcul local.
{
	const serveur: NaOverview = {
		depts: overview.depts.map((d) => (d.dept === "33" ? { ...d, evenements: 99 } : d)),
		total: { ...overview.total, evenements: 101 },
	};
	const html = renderToStaticMarkup(<NaView {...baseProps} overview={serveur} />);
	check("l'agrégat serveur fait foi", html.includes("99 événements"), "");
}

console.log(`\n${failures === 0 ? "na-verif : tous les contrôles passent" : `na-verif : ${failures} contrôle(s) en échec`}`);
process.exit(failures === 0 ? 0 : 1);
