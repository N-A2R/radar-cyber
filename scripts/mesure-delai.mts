/**
 * Délai réel entre la publication d'un fait et son arrivée dans le radar.
 *
 * La mesure de couverture publiait un « délai médian » calculé sur une
 * simulation, et multiplié par zéro : il valait toujours 0 jour. Ce script
 * mesure ce qui existe vraiment en base — `observed_at` (quand le fait est
 * arrivé dans le monde) contre `created_at` (quand le radar l'a écrit).
 *
 * Trois précautions :
 *  - seuls les événements portant une date source sont comptés, sinon le délai
 *    se réduirait à l'heure de collecte ;
 *  - les délais négatifs (date source postérieure à la collecte) sont comptés
 *    à part : ce sont des erreurs de date, pas des exploits de vitesse ;
 *  - les sources dont le flux est un bulletin (CERT-FR, NVD, KEV) publient
 *    souvent avec plusieurs jours de retard sur le fournisseur : le délai
 *    qu'on mesure est celui de *notre* veille, pas celui de l'éditeur.
 *
 *   tsx scripts/mesure-delai.mts
 */
import { query } from "../apps/api/src/db.js";
import { mediane } from "../apps/api/src/analyse/mediane.js";

type Ligne = { source_id: string; heures: number };

const { rows } = await query<Ligne>(`
	SELECT source_id,
	       EXTRACT(EPOCH FROM (created_at - observed_at)) / 3600.0 AS heures
	  FROM event
	 WHERE observed_at IS NOT NULL
	   AND created_at >= observed_at - interval '1 day'
`);

const { rows: negatifs } = await query<{ n: string }>(`
	SELECT count(*)::text AS n FROM event
	 WHERE observed_at IS NOT NULL AND created_at < observed_at - interval '1 day'
`);

const parSource = new Map<string, number[]>();
for (const r of rows) {
	const liste = parSource.get(r.source_id) ?? [];
	liste.push(Number(r.heures));
	parSource.set(r.source_id, liste);
}

/**
 * Sources dont `observed_at` est la date de la vulnérabilité, pas celle de la
 * publication du flux : un CVE de 2022 entre dans KEV en 2026 et affiche un
 * « délai » de 1 325 jours. Ce n'est pas notre latence, c'est l'âge du CVE.
 * On les exclut du délai de veille et on les publie à part.
 */
const DATES_PORTEUSES = new Set(["nvd_cve", "cisa_kev", "epss", "epss-cve"]);

const toutes = rows.map((r) => Number(r.heures));
const veille = rows.filter((r) => !DATES_PORTEUSES.has(r.source_id)).map((r) => Number(r.heures));
const med = mediane(veille);

function quantile(valeurs: number[], q: number): number {
	if (valeurs.length === 0) return 0;
	const tri = [...valeurs].sort((a, b) => a - b);
	const i = Math.min(tri.length - 1, Math.floor(q * (tri.length - 1)));
	return tri[i] as number;
}

function jours(h: number): string {
	return (h / 24).toFixed(1).replace(".", ",");
}

console.log(`Événements datés : ${toutes.length}`);
console.log(`  dont bulletins de vulnérabilités (date = date du CVE) : ${toutes.length - veille.length}`);
console.log(`Délai médian de veille : ${med === null ? "non mesuré" : `${jours(med)} jour(s)`}  (sur ${veille.length} faits)`);
console.log(`  premier quartile : ${jours(quantile(veille, 0.25))} j`);
console.log(`  troisième quartile : ${jours(quantile(veille, 0.75))} j`);
console.log(`Délais aberrants (date source > collecte de plus d'un jour) : ${negatifs[0]?.n ?? 0}`);
console.log("");
console.log("Par source (au moins 20 faits), du plus rapide au plus lent :");
const detail = [...parSource.entries()]
	.filter(([source, v]) => v.length >= 20 && !DATES_PORTEUSES.has(source))
	.map(([source, v]) => ({ source, n: v.length, med: mediane(v) ?? 0 }))
	.sort((a, b) => a.med - b.med);
for (const d of detail.slice(0, 15)) {
	console.log(`  ${jours(d.med).padStart(7)} j  ${String(d.n).padStart(5)} faits  ${d.source}`);
}
process.exit(0);
