/**
 * Purge des événements non-claims — les pages d'outillage lues comme des faits.
 *
 * Deux sources de la famille `ransomware` (`ransom-emsisoft-decrypt`,
 * `ransom-nomoreransom`) ne publient pas de revendications : ce sont des pages
 * d'outils de déchiffrement. Le parseur générique y a lu des compteurs de pays
 * et produit des « événements » intitulés « 08 France 17 » ou
 * « © 2003-2026 Emsisoft ». Ils faussent toute mesure de couverture.
 *
 * Rien n'est détruit sans trace : le RÉSUMÉ part dans `event_archive` ET la
 * copie intégrale dans `archive_event` avant suppression (depuis migrate-231,
 * un trigger refuse tout DELETE qui n'aurait pas écrit les deux). La purge est
 * consignée au journal (append-only, non contournable).
 *
 *   tsx scripts/purge-non-claims.mts              # constat (défaut)
 *   tsx scripts/purge-non-claims.mts --apply      # archive, supprime, consigne
 *
 * DATABASE_URL doit être posée (les scripts ne lisent pas .env).
 */
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { consigner } from "../apps/api/src/journal/index.js";

const SOURCES = ["ransom-emsisoft-decrypt", "ransom-nomoreransom"] as const;
const apply = process.argv.includes("--apply");

const before = await query<{ source_id: string; n: string }>(
	"SELECT source_id, count(*)::text AS n FROM event WHERE source_id = ANY($1) GROUP BY 1 ORDER BY 1",
	[SOURCES],
);
const total = before.rows.reduce((sum, r) => sum + Number(r.n), 0);
console.log(`Événements non-claims en base : ${total}`);
for (const row of before.rows) console.log(`  ${row.source_id.padEnd(24)} ${row.n}`);

const samples = await query<{ title: string }>(
	"SELECT title FROM event WHERE source_id = ANY($1) ORDER BY id LIMIT 5",
	[SOURCES],
);
for (const row of samples.rows) console.log(`  exemple : ${row.title.slice(0, 70)}`);

if (!apply) {
	console.log("\nConstat seulement. Relancer avec --apply pour archiver puis purger.");
	await closePools();
	process.exit(0);
}

const result = await withTransaction(async (client) => {
	const archived = await client.query(
		`INSERT INTO event_archive
		   (dedup_key, family, assertion_type, org_id, org_name, org_kind, dept,
		    source_id, source_url, severity, confidence, admission_rule,
		    observed_at, collected_at, valid_at, at)
		 SELECT e.dedup_key, e.family, e.assertion_type, e.org_id, o.name, o.kind, o.dept,
		        e.source_id, e.source_url, e.severity, e.confidence, e.admission_rule,
		        e.observed_at, e.collected_at, e.valid_at, e.at
		   FROM event e
		   LEFT JOIN org o ON o.id = e.org_id
		  WHERE e.source_id = ANY($1)
		 ON CONFLICT (dedup_key) DO NOTHING`,
		[SOURCES],
	);
	// Le résumé seul ne suffit pas : depuis migrate-231, un DELETE sans copie
	// intégrale est refusé par le trigger. On écrit donc les DEUX archives
	// avant la suppression, dans la même transaction.
	const complete = await client.query(
		`INSERT INTO archive_event
		   (id, dedup_key, family, assertion_type, title, summary,
		    observed_at, collected_at, valid_at, at, severity, confidence,
		    source_id, source_url, evidence, geo_type, lat, lon, org_id, asset_id, created_at)
		 SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
		        e.observed_at, e.collected_at, e.valid_at, e.at, e.severity, e.confidence,
		        e.source_id, e.source_url, e.evidence, e.geo_type, e.lat, e.lon,
		        e.org_id, e.asset_id, e.created_at
		   FROM event e
		  WHERE e.source_id = ANY($1)
		 ON CONFLICT (dedup_key) DO NOTHING`,
		[SOURCES],
	);
	const deleted = await client.query("DELETE FROM event WHERE source_id = ANY($1)", [SOURCES]);
	return {
		archived: archived.rowCount ?? 0,
		complete: complete.rowCount ?? 0,
		deleted: deleted.rowCount ?? 0,
	};
});

// `consigner` n'échoue jamais par exception : il renvoie { ok:false, error }.
// On ne peut donc pas se contenter de l'attendre et d'annoncer le succès : le
// DELETE est déjà committé, et une purge non consignée contredirait le
// contrat du script (« rien n'est détruit sans trace »).
const journal = await consigner({
	kind: "event.purge",
	subject: "non-claims",
	summary: `${result.deleted} événement(s) non-claim(s) purgé(s) — ${SOURCES.join(", ")}`,
	actor: "humain:operateur",
	payload: { sources: SOURCES, archived: result.archived, complete: result.complete, deleted: result.deleted },
});

const after = await query<{ n: string }>("SELECT count(*)::text AS n FROM event WHERE source_id = ANY($1)", [SOURCES]);
console.log(`\nrésumés : ${result.archived} · copies intégrales : ${result.complete} · supprimés : ${result.deleted} · restants : ${after.rows[0]?.n ?? "?"}`);
if (journal.ok) {
	console.log("Purge consignée au journal (kind=event.purge).");
} else {
	console.error(`Purge NON consignée : ${journal.error ?? "raison inconnue"}`);
	console.error(
		`Les ${result.deleted} événements sont déjà supprimés, mais archivés : rejoue kind=event.purge à la main.`,
	);
	await closePools();
	process.exit(1);
}

await closePools();
