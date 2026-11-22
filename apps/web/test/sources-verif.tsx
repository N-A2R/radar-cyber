/**
 * Vérification runtime de l'écran sources enrichi (chantier 14).
 *
 * Ce que le typecheck ne voit pas : est-ce que la colonne de rendement affiche
 * « — » quand rien n'a été mesuré, plutôt que « 0 % » ? Est-ce qu'une source
 * qui lit 40 entrées sans rien rendre se distingue d'une source qu'on n'a
 * jamais interrogée ? C'est toute la différence entre un tableau de bord et un
 * tableau qui rassure.
 *
 * Rendu statique React, sans navigateur ni base.
 */
import { renderToStaticMarkup } from "react-dom/server";
import SourcesView from "../src/components/SourcesView";
import { sourceYield, type Source } from "../src/api";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
}

const base: Source = {
	id: "s0",
	name: "Source neutre",
	family: "cti",
	url: "https://example.invalid",
	kind: "narrative",
	format: "rss",
	enabled: true,
	intervalSec: 3600,
	lastOkAt: null,
	lastErrorAt: null,
	lastError: null,
	itemsTotal: null,
	lastItems: null,
	ok: false,
	disabledAt: null,
	disabledReason: null,
	entrees: null,
	rejets: null,
	evenements30j: 0,
	evenementsTotal: 0,
	dernierRun: null,
	dernierRunStatut: null,
	rendement: null,
	motifs: null,
	motifDominant: null,
};

const productive: Source = {
	...base,
	id: "cert-fr",
	name: "CERT-FR",
	lastOkAt: "2026-11-13T08:00:00Z",
	entrees: 120,
	evenements30j: 22,
	evenementsTotal: 486,
	dernierRun: "2026-11-13T08:00:00Z",
	dernierRunStatut: "ok",
	rendement: 0.183,
};

// Lit beaucoup, ne retient rien : c'est le parseur ou la porte, pas la source.
const vide: Source = {
	...base,
	id: "presse-vide",
	name: "Presse qui lit sans rendre",
	lastOkAt: "2026-11-13T07:00:00Z",
	entrees: 40,
	rejets: 40,
	evenements30j: 0,
	// La source lit 40 entrées et les refuse toutes pour la même raison : c'est
	// ce motif qui dit s'il faut instruire la porte ou le parseur.
	motifs: { hors_sujet: 34, presse: 6 },
	motifDominant: "hors_sujet",
	dernierRun: "2026-11-13T07:00:00Z",
	dernierRunStatut: "ok",
	rendement: 0,
};

// Le collecteur est passé, n'a rien lu : la source est peut-être cassée.
const muette: Source = {
	...base,
	id: "muette",
	name: "Muette",
	lastOkAt: "2026-11-10T07:00:00Z",
	evenements30j: 0,
	dernierRun: "2026-11-12T07:00:00Z",
	dernierRunStatut: "ok",
};

// Aucun passage mesurable : inconnue, ce qui n'est pas « nulle ».
const inconnue: Source = { ...base, id: "jamais", name: "Jamais tentée" };

// Deux sources qui parlent des mêmes faits : celle qui révèle, celle qui suit.
// Le volume de la seconde peut être supérieur — c'est tout le piège.
const revelatrice: Source = { ...productive, id: "locale", name: "Rédactions locales", faits: 12, faitsUniques: 7, partUniquesPct: 58, primeurs: 7, retardMedianHeures: null };
const suiveuse: Source = { ...productive, id: "agregateur", name: "Agrégateur", faits: 40, faitsUniques: 0, partUniquesPct: 0, primeurs: 0, retardMedianHeures: 6 };

const html = renderToStaticMarkup(
	<SourcesView sources={[productive, vide, muette, inconnue, revelatrice, suiveuse]} loading={false} error={null} />,
);

check("écran rendu", html.includes("Sources"));
check("colonne de rendement présente", html.includes("rendement"));
check("colonne des entrées lues", html.includes("lues 30 j"));
check("synthèse par rendement", html.includes("qui lisent sans rendre"), html.slice(0, 0));
check("rendement affiché en pourcentage", html.includes("18 %"));
check(
	"une source non mesurée affiche « — », jamais « 0 % »",
	(html.match(/>—</g) ?? []).length >= 1,
);
check("la source vide affiche 0 %", html.includes("0 %"));
check("marqueur de rendement posé", html.includes('data-yield="productive"') && html.includes('data-yield="vide"'));
check("le motif de rejet dominant est affiché", html.includes("hors sujet"), "la source vide rejette 34 entrées pour ce motif");
check("le motif porte son compteur", html.includes("(34)"));
check("les motifs non mesurés sont dits", html.includes("non mesuré"));

check("colonne d'unicité présente", html.includes("unicité"));
check("l'unicité est chiffrée", html.includes("7/12") && html.includes("0/40"));
check(
	"une source qui ne révèle rien est marquée comme telle",
	html.includes('data-unique="non"') && html.includes('data-unique="oui"'),
);
check(
	"une source jamais évaluée n'est pas notée « 0/0 »",
	!html.includes("0/0") && html.includes("non mesuré"),
);

check("production reconnue", sourceYield(productive) === "productive");
check("lecture sans rendement reconnue", sourceYield(vide) === "vide");
check("mutisme reconnu", sourceYield(muette) === "muette");
check("absence de mesure reconnue", sourceYield(inconnue) === "inconnue");

// Une source qui a un stock mais aucun passage récent n'est pas « muette » :
// elle a produit un jour, on ne sait pas ce qu'elle vaut aujourd'hui.
check(
	"stock sans passage récent classé inconnu",
	sourceYield({ ...base, evenementsTotal: 12, dernierRun: null, evenements30j: 0, entrees: null }) === "inconnue",
);

// Tri par défaut : les sources qui ne rapportent rien doivent être visibles en
// premier, pas enterrées sous cent lignes productives.
const firstRow = html.indexOf("Jamais tentée");
const lastRow = html.indexOf("CERT-FR");
check("le registre ouvre sur ce qui ne rend rien", firstRow !== -1 && lastRow !== -1 && firstRow < lastRow);

// Le vrai registre porte ~2 506 sources : une seule page de 50 lignes doit
// être montée, et le compteur doit annoncer le total filtré, pas la page.
const registre: Source[] = Array.from({ length: 2506 }, (_, index) => ({
	...base,
	id: `flux-${index}`,
	name: `Flux ${String(index).padStart(4, "0")}`,
}));
const htmlRegistre = renderToStaticMarkup(
	<SourcesView sources={registre} loading={false} error={null} />,
);
const lignesMontees = (htmlRegistre.match(/class="sources-table__name"/g) ?? []).length;
check("2 506 sources ne montent que 50 lignes", lignesMontees === 50, `${lignesMontees} lignes DOM`);
const compteur = (htmlRegistre.match(/class="sources-view__count"[^>]*>([^<]*)</) ?? [])[1]?.replace(/\u202f|\u00a0/g, " ").trim();
check("compteur paginé sur le total filtré", compteur === "1–50 sur 2 506", compteur);
check("pagination annoncée", htmlRegistre.includes("page 1 sur 51"));

console.log(failures === 0 ? "\nsources: tout est vert" : `\nsources: ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
