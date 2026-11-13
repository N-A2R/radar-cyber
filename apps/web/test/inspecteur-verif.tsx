/**
 * Vérification runtime de l'inspecteur enrichi (chantier 16).
 *
 * Ce que le typecheck ne voit pas : est-ce qu'un événement **non rattaché**
 * affiche quand même sa raison ? Est-ce qu'un événement d'avant le chantier
 * (sans explication) ne fait pas croire qu'il n'y avait rien à dire ?
 * Est-ce qu'un index indisponible n'est pas présenté comme un verdict ?
 *
 * Rendu statique React, sans navigateur ni réseau.
 */
import { renderToStaticMarkup } from "react-dom/server";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

// L'Inspector charge par réseau à l'initialisation : on teste la fonction de
// rendu du bloc, exportée pour la vérification. Le serveur de rendu statique
// n'exécute pas d'effet, donc l'état reste « idle » — inutile ici.
const { renduRattachement } = await import("../src/components/rattachement-view.js");

const rattache = renduRattachement({
	motif: "departement",
	libelle: "homonymes départagés par le département cité",
	alias: "residence du parc",
	confiance: 0.85,
	moteur: "gazetteer@2",
	candidats: [
		{ id: 12, name: "Résidence du Parc (Niort)" },
		{ id: 13, name: "Résidence du Parc (Angoulême)" },
	],
	indecis: false,
});
const htmlRattache = renderToStaticMarkup(rattache);
check("le motif est affiché en clair", htmlRattache.includes("départagés par le département"));
check("l'alias retenu est visible", htmlRattache.includes("residence du parc"));
check("la confiance est en pourcentage", htmlRattache.includes("85 %"));
check("les candidats écartés sont listés", htmlRattache.includes("Résidence du Parc (Niort)"));

const refuse = renduRattachement({
	motif: "ambigu",
	libelle: "plusieurs organisations également plausibles : aucun choix",
	alias: "residence du parc",
	confiance: 0,
	moteur: "gazetteer@2",
	candidats: [{ id: 12, name: "A" }, { id: 13, name: "B" }],
	indecis: false,
});
const htmlRefus = renderToStaticMarkup(refuse);
check("un refus de trancher est marqué", htmlRefus.includes('data-motif="ambigu"'));
check("un refus ne prétend pas avoir rattaché", !htmlRefus.includes("Confiance"));

const indisponible = renduRattachement({
	motif: "aucun",
	libelle: "aucune organisation du référentiel n'est citée",
	alias: null,
	confiance: 0,
	moteur: "gazetteer@2",
	candidats: [],
	indecis: true,
});
const htmlIndecis = renderToStaticMarkup(indisponible);
check("un index indisponible est dit", htmlIndecis.includes("référentiel indisponible"));
check("un index indisponible n'est pas un verdict", htmlIndecis.includes("n&#x27;est pas un verdict") || htmlIndecis.includes("n'est pas un verdict"), htmlIndecis.slice(0, 400));

const ancien = renderToStaticMarkup(renduRattachement(null, false));
check("un événement d'avant le chantier est signalé", ancien.includes("motif non conservé"));
const ancienRattache = renderToStaticMarkup(renduRattachement(null, true));
check("un rattachement ancien ne nie pas son motif", ancienRattache.includes("motif non conservé"));

console.log(failures === 0 ? "\ninspecteur: tout est vert" : `\ninspecteur: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
