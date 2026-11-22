/**
 * Collecte des procédures collectives BODACC (Nouvelle-Aquitaine) par SIREN.
 *
 *   pnpm collecte:bodacc                 # collecte et écrit en base
 *   pnpm collecte:bodacc -- --dry-run    # lit l'API, n'écrit rien
 *   pnpm collecte:bodacc -- --jours=30   # fenêtre glissante
 *
 * Chaque événement `family='bodacc'` porte trois preuves non nulles :
 * `observed_at` (date de parution), `evidence.siren` (9 chiffres) et
 * `evidence.url_bodacc` (URL de l'annonce d'origine). La migration 200 pose
 * la contrainte SQL correspondante ; ce script ne fait que remplir.
 *
 * Aucune donnée personnelle : le collecteur n'exporte ni nom de personne
 * physique, ni adresse. Voir docs/bodacc-procedures-collectives.md.
 */
import { collector } from "../apps/api/src/collectors/bodacc.collector.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const joursArg = argv.find((a) => a.startsWith("--jours="))?.split("=")[1];
const jours = joursArg === undefined ? 30 : Number(joursArg);
if (!Number.isInteger(jours) || jours < 1 || jours > 30) throw new Error("--jours doit être entre 1 et 30");

const SOURCE_ID = "bodacc:pc-na";

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		headers: { Accept: "application/json", "User-Agent": "RadarNA/1.0 (BODACC, données publiques DILA)" },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
	return (await response.json()) as T;
}

const source = await query<{ id: string; enabled: boolean }>("SELECT id, enabled FROM source WHERE id = $1", [SOURCE_ID]);
if (source.rows.length === 0) {
	throw new Error(`source ${SOURCE_ID} absente : appliquer db/migrate-200-bodacc-pc.sql (pnpm migrate)`);
}

const now = new Date();
const result = await collector.run({
	fetchJson,
	fetchText: async () => {
		throw new Error("BODACC ne lit que du JSON");
	},
	cursor: {},
	log: (message) => console.log(`[bodacc] ${message}`),
	now: () => now,
});

const retenus = result.events.filter((ev) => {
	const jour = ev.observedAt?.slice(0, 10) ?? "";
	const cutoff = new Date(now.getTime() - jours * 86_400_000).toISOString().slice(0, 10);
	return jour >= cutoff;
});

let inseres = 0;
let doublons = 0;
let rejetes = 0;
const motifs: Record<string, number> = {};

if (!dryRun) {
	for (const brut of retenus) {
		const admission = admitEvent(brut as unknown as Record<string, unknown>);
		if (!admission.ok) {
			rejetes++;
			for (const motif of admission.rejections) motifs[motif] = (motifs[motif] ?? 0) + 1;
			continue;
		}
		const ev = admission.event;
		const r = await ingestQuery(
			`INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, observed_at, valid_at, severity, confidence, source_id, source_url, evidence, geo_type, regional, regional_motif)
			 VALUES ($1,$2,$3,$4,$5,'fr',$6,$6,$7,$8,$9,$10,$11,$12,true,'departement')
			 ON CONFLICT (dedup_key) DO NOTHING`,
			[
				ev.dedupKey,
				ev.family,
				ev.assertionType,
				ev.title,
				ev.summary ?? null,
				ev.observedAt ?? null,
				ev.severity,
				ev.confidence ?? null,
				ev.sourceId,
				ev.sourceUrl ?? null,
				JSON.stringify(ev.evidence ?? {}),
				ev.geoType,
			]
		);
		if ((r.rowCount ?? 0) > 0) inseres++;
		else doublons++;
	}
	await ingestQuery(
		`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error)
		 VALUES ($1, now(), 'ok', $2, $3, NULL)`,
		[SOURCE_ID, retenus.length, inseres]
	).catch(() => {});
	await ingestQuery("UPDATE source SET last_ok_at = now(), cursor = $1 WHERE id = $2", [
		JSON.stringify({ recolteAt: now.toISOString(), derniereParution: result.cursor?.["derniereParution"] ?? null }),
		SOURCE_ID,
	]);
}

const mesure = await query<{ total: string; preuves_incompletes: string }>(
	`SELECT count(*)::text AS total,
	        count(*) FILTER (WHERE evidence->>'url_bodacc' IS NULL
	                           OR evidence->>'siren' IS NULL
	                           OR observed_at IS NULL)::text AS preuves_incompletes
	   FROM event
	  WHERE family = 'bodacc'
	    AND observed_at >= now() - interval '30 days'`
);

console.log(
	JSON.stringify(
		{
			collecteAt: now.toISOString(),
			fenetreJours: jours,
			dryRun,
			annoncesRetenues: retenus.length,
			inseres,
			doublons,
			rejetes,
			motifsRejet: motifs,
			base: {
				total30j: Number(mesure.rows[0]?.total ?? 0),
				preuvesIncompletes: Number(mesure.rows[0]?.preuves_incompletes ?? 0),
			},
		},
		null,
		2
	)
);

await closePools();
