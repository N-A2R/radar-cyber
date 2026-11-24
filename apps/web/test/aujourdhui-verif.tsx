/**
 * Vérification du lien hérité `#/today` : il ouvre désormais la Carte,
 * panneau « carte », sans perdre les filtres family/dept. L'ancien écran
 * d'accueil n'existe plus ; ce contrôle garde son URL partageable vivante.
 */
import { DEFAULT_STATE, parseHash, toHash } from "../src/url-state";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures += 1;
}

const filtre = parseHash("#/today?family=leaks&dept=33");
check("l'alias today ouvre la Carte", filtre.view === "map" && filtre.mapPanel === "carte");
check("les filtres hérités sont conservés", filtre.today.family === "leaks" && filtre.today.dept === "33");
const canonique = toHash(filtre);
check("le lien est réécrit vers la Carte", canonique === "#/map?family=leaks&dept=33", canonique);
check("un filtre invalide est neutralisé",
	parseHash("#/today?family=<script>&dept=zzz").today.family === null
	&& parseHash("#/today?family=<script>&dept=zzz").today.dept === null);
check("la destination par défaut reste courte", toHash({ ...DEFAULT_STATE, view: "map" }) === "#/map");

console.log(failures === 0 ? "\nAujourd'hui (alias Carte) : tous les contrôles passent."
	: `\nAujourd'hui (alias Carte) : ${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
