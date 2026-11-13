/**
 * Vérification runtime du bloc « faits » de la fiche organisation.
 *
 * Ce que le typecheck ne voit pas : est-ce qu'un fait isolé se distingue d'un
 * fait corroboré ? Est-ce qu'un désaccord s'affiche au lieu d'être moyenné ?
 * Est-ce qu'un serveur sans analyse multi-sources laisse la fiche utilisable ?
 */
import { renderToStaticMarkup } from "react-dom/server";
import { renduCorroboration } from "../src/components/corroboration-view";
import type { Corroboration } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

const corr: Corroboration = {
	resume: { faits: 2, evenements: 4, sources: 3, corrobores: 1, isoles: 1, desaccords: 1 },
	groupes: [
		{
			cle: "ransomware:2026-10-01",
			family: "ransomware",
			orgId: 7,
			titre: "Rançongiciel : la scierie à l'arrêt",
			debut: "2026-10-01T08:00:00Z",
			fin: "2026-10-02T09:00:00Z",
			sourcesDistinctes: 3,
			force: "etabli",
			sources: [
				{ sourceId: "sudouest", premiereDate: "2026-10-01T08:00:00Z", estPremier: true, delaiHeures: 0, evenements: 1, graviteMax: 5, assertion: "confirmed_incident" },
				{ sourceId: "france3", premiereDate: "2026-10-01T14:00:00Z", estPremier: false, delaiHeures: 6, evenements: 1, graviteMax: 4, assertion: "confirmed_incident" },
				{ sourceId: "actu", premiereDate: "2026-10-02T09:00:00Z", estPremier: false, delaiHeures: 25, evenements: 2, graviteMax: 4, assertion: "third_party_claim" },
			],
		},
		{
			cle: "phishing:2026-10-10",
			family: "phishing",
			orgId: 7,
			titre: "Hameçonnage signalé",
			debut: "2026-10-10T08:00:00Z",
			fin: "2026-10-10T08:00:00Z",
			sourcesDistinctes: 1,
			force: "isole",
			sources: [
				{ sourceId: "cert_fr", premiereDate: "2026-10-10T08:00:00Z", estPremier: true, delaiHeures: 0, evenements: 1, graviteMax: 2, assertion: "technical_indicator" },
			],
		},
	],
	desaccords: [
		{
			cle: "ransomware:2026-10-01",
			orgId: 7,
			family: "ransomware",
			objet: "nature",
			description: "une source confirme l'incident, une autre ne fait que relayer une revendication",
			positions: [
				{ sourceId: "sudouest", valeur: "confirmé" },
				{ sourceId: "actu", valeur: "revendiqué" },
			],
		},
	],
};

const html = renderToStaticMarkup(renduCorroboration(corr));
check("la section se rend", html.includes("faits"));
check("le nombre de faits est affiché", html.includes(">2<"));
check("les faits corroborés et isolés sont distingués", html.includes("corroborés") && html.includes("isolés"));
check("un fait établi affiche sa force", html.includes("3 sources ou plus"));
check("la source qui a révélé le fait est nommée", html.includes("révélé par sudouest"));
check("le délai de reprise est lisible", html.includes("6 h après"));
check("le désaccord est affiché", html.includes("ne fait que relayer une revendication"));
check("les positions opposées sont montrées", html.includes("confirmé") && html.includes("revendiqué"));

// Un serveur d'avant l'analyse multi-sources ne doit pas casser la fiche.
const absent = renderToStaticMarkup(renduCorroboration(null));
check("l'absence d'analyse est dite", absent.includes("non disponible"));
check("l'absence ne prétend pas à zéro fait", !absent.includes(">0<"));

// Aucun fait : pas de liste vide muette.
const vide: Corroboration = { resume: { faits: 0, evenements: 0, sources: 0, corrobores: 0, isoles: 0, desaccords: 0 }, groupes: [], desaccords: [] };
const htmlVide = renderToStaticMarkup(renduCorroboration(vide));
check("aucun fait est explicite", htmlVide.includes("aucun fait sur 180 jours"));
check("aucun désaccord n'affiche pas de sous-titre", !htmlVide.includes("ne s'accordent pas"));

console.log(failures === 0 ? "\ncorroboration: tout est vert" : `\ncorroboration: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
