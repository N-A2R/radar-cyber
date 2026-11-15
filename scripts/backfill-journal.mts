/**
 * Backfill du journal de vérité.
 *
 * Le 13 novembre 2026, les faits de plusieurs collectes (NVD, KEV, CERT-FR,
 * RansomLook, NCSC) ont été perdus : `consignerLot` écrivait en un seul INSERT,
 * l'échec était avalé, et 6 072 événements sont restés sans trace. Le défaut
 * d'écriture est corrigé ; ce script répare la mémoire.
 *
 * Pour chaque événement sans trace, il re-consigne le fait de rattachement
 * reconstruit depuis la projection — avec `valid_at` = date observée et
 * `recorded_at` = maintenant, ce qui est honnête en bi-temporel : le fait était
 * vrai dans le monde à cette date, on l'a retrouvé aujourd'hui. Idempotent :
 * ne touche que ce qui reste sans trace.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { consignerLot, type JournalEntry } from "../apps/api/src/journal/index.js";

type Orphelin = {
	dedup_key: string;
	org_id: number | null;
	family: string;
	admission_rule: string | null;
	observed_at: string | null;
	source_id: string;
};

const MOTIF = "reconsigné : fait d'origine perdu en collecte, échec de lot silencieux (13/11/2026)";

const { rows } = await query<Orphelin>(`
	SELECT e.dedup_key, e.org_id, e.family, e.admission_rule, e.observed_at, s.id AS source_id
	  FROM event e
	  JOIN source s ON s.id = e.source_id
	 WHERE NOT EXISTS (SELECT 1 FROM journal j WHERE j.subject = e.dedup_key)
	 ORDER BY e.id`);

console.log(`${rows.length} événement(s) sans trace de journal`);

const faits: JournalEntry[] = rows.map((e) => ({
	kind: e.org_id !== null ? "event.rattachement" : "match.decided",
	subject: e.dedup_key,
	summary: `${e.source_id} : reconsigné après lacune de collecte — ${e.org_id !== null ? `rattaché (org ${e.org_id})` : "non rattaché"}`,
	actor: "backfill:journal@1",
	payload: {
		orgId: e.org_id,
		famille: e.family,
		admission: e.admission_rule,
		motif: MOTIF,
	},
	validAt: e.observed_at,
}));

const lot = await consignerLot(faits);
console.log(
	`journal : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s)`,
);
for (const erreur of lot.erreurs.slice(0, 10)) console.error(`  ${erreur}`);

const { rows: reste } = await query<{ n: string }>(
	`SELECT count(*)::text AS n FROM event e
	  WHERE NOT EXISTS (SELECT 1 FROM journal j WHERE j.subject = e.dedup_key)`,
);
console.log(`resté sans trace : ${reste[0]?.n ?? "?"}`);

await closePools();
if (Number(reste[0]?.n ?? 0) > 0) process.exit(1);
