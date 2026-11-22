/**
 * Garde-fous des règles de précision branchées (vague branchement, S3).
 *
 * Les règles (spec : src/match/regles-precision.ts) sont consultées par la
 * promotion derrière PRECISION_RULES=on|off. Ces tests verrouillent les deux
 * régimes **dans le moteur** (promoteMatches / promoteOne), pas seulement les
 * prédicats (voir regles-precision.test.ts) :
 *
 *   - un indice que le moteur rattachait à tort ne produit plus de
 *     rattachement quand les règles sont actives, et le refus est écrit au
 *     journal avec la règle qui l'a posé (ex. historique : `wakao.co.jp` →
 *     « CO & CO ») ;
 *   - un indice que le moteur rattachait juste continue de l'être avec les
 *     règles actives (chemin domaine = clé, égalité de nom) — pas de
 *     régression de couverture sur les cas sûrs.
 *
 * Isolation : enregistrements jetables (préfixe TAG, domaine .example),
 * supprimés dans le `after` global ; le drapeau est posé et restauré par test.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { promoteMatches, promoteOne } from "../src/quarantine/promote.js";

const TAG = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
function next(): string {
	seq += 1;
	return `${TAG}-${seq}`;
}

const createdOrgs: number[] = [];
const createdFacts: Array<{ id: number; contentHash: string }> = [];

/** Pose le drapeau pour la durée du test et le restaure ensuite. */
function avecDrapeau(valeur: "on" | "off"): void {
	process.env.PRECISION_RULES = valeur;
}
function sansDrapeau(): void {
	delete process.env.PRECISION_RULES;
}

async function insertOrg(
	name: string,
	opts: { domain?: string | null; city?: string | null } = {}
): Promise<number> {
	const r = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, domain, city) VALUES ($1,$2,$3,$4,$5) RETURNING id",
		[name, next(), "entreprise", opts.domain ?? null, opts.city ?? null]
	);
	createdOrgs.push(r.rows[0].id);
	return r.rows[0].id;
}

async function insertFact(orgHint: string): Promise<{ id: number; contentHash: string }> {
	const contentHash = `hash-${next()}`;
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw (source, source_url, groupe, org_hint, claimed_at, extracted, raw_body, content_hash)
		 VALUES ('test', $1, 'Groupe Regles', $2, now(), '{}'::jsonb, 'revendication de test', $3) RETURNING id`,
		[
			`https://example.invalid/${next()}`,
			orgHint,
			contentHash,
		]
	);
	const created = { id: r.rows[0].id, contentHash };
	createdFacts.push(created);
	return created;
}

async function eventOrgId(contentHash: string): Promise<number | null | undefined> {
	const r = await query<{ org_id: number | null }>(
		"SELECT org_id FROM event WHERE dedup_key = $1",
		[`quarantine:${contentHash}`]
	);
	return r.rows[0]?.org_id;
}

async function refusJournal(contentHash: string): Promise<Array<{ regle: string | null; kind: string }>> {
	const r = await query<{ regle: string | null; kind: string }>(
		"SELECT payload->>'regle' AS regle, kind FROM journal WHERE kind='match.refuse' AND subject=$1",
		[`quarantine:${contentHash}`]
	);
	return r.rows;
}

after(async () => {
	sansDrapeau();
	const hashes = createdFacts.map((f) => f.contentHash);
	if (hashes.length) {
		const ev = await query<{ id: number }>(
			"SELECT id FROM event WHERE dedup_key = ANY($1::text[])",
			[hashes.map((h) => `quarantine:${h}`)]
		);
		const evIds = ev.rows.map((x) => x.id);
		if (evIds.length) {
			await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [evIds]);
			await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [evIds]);
		}
	}
	const factIds = createdFacts.map((f) => f.id);
	if (factIds.length) await query("DELETE FROM quarantine_raw WHERE id = ANY($1::bigint[])", [factIds]);
	if (createdOrgs.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [createdOrgs]);
	await closePools();
});

test("S3.1 — le cas historique wakao.co.jp → « CO & CO » ne produit plus de rattachement, quel que soit le régime", async () => {
	// Le moteur ne doit pas rattacher un domaine en .co. à une org dont le
	// nom réduit donne deux jetons d'une lettre (corrigé moteur + règle 2) :
	// la règle ne doit rien ressusciter et le correctif moteur doit tenir.
	await insertOrg(`CO & CO ${TAG}`, { city: "Billère" });
	for (const regime of ["off", "on"] as const) {
		avecDrapeau(regime);
		const fact = await insertFact("wakao.co.jp");
		const r = await promoteMatches(false, { ids: [fact.id], log: () => {} });
		assert.equal(r.scanned, 1);
		assert.equal(r.matched, 0, `${regime} : aucun rattachement`);
		assert.equal(r.promoted, 0);
		assert.equal(await eventOrgId(fact.contentHash), undefined, `${regime} : pas d'événement`);
	}
	sansDrapeau();
});

test("S3.1 — drapeau off : l'indice masqué est rattaché (comportement livré, le tort d'origine)", async () => {
	const org = await insertOrg(`F H ${TAG}`);
	const fact = await insertFact(`F*****H ${TAG}`);
	const r = await promoteMatches(false, { ids: [fact.id], log: () => {} });
	assert.equal(r.matched, 1, "off : le rapprochement à 0,9 passe");
	assert.equal(r.promoted, 1);
	assert.equal(r.refusRegles["3-masquage"], undefined, "off : aucun refus");
	assert.equal(await eventOrgId(fact.contentHash), org, "off : l'événement est rattaché (c'est le tort documenté)");
});

test("S3.1 — drapeau on : le même indice est refusé par 3-masquage et journalisé avec la règle", async () => {
	await insertOrg(`F H ${TAG} b`);
	const fact = await insertFact(`F*****H ${TAG} b`);

	avecDrapeau("on");
	const r = await promoteMatches(false, { ids: [fact.id], log: () => {} });
	assert.equal(r.matched, 0, "on : aucun rattachement produit");
	assert.equal(r.promoted, 0, "on : le fait reste en file pour la revue");
	assert.deepEqual(r.refusRegles, { "3-masquage": 1 });
	assert.equal(r.refus.length, 1);
	assert.equal(r.refus[0]?.regle, "3-masquage");
	assert.equal(r.refus[0]?.indice, `F*****H ${TAG} b`);
	assert.equal(await eventOrgId(fact.contentHash), undefined, "on : pas d'événement");

	// Le refus porte la règle qui l'a posé (S1.2) — et il n'est pas réécrit au
	// passage suivant (journal append-only, dédoublonné par (sujet, règle)).
	const trace = await refusJournal(fact.contentHash);
	assert.equal(trace.length, 1);
	assert.equal(trace[0]?.regle, "3-masquage");
	const second = await promoteMatches(false, { ids: [fact.id], log: () => {} });
	assert.equal(second.scanned, 1, "le fait est toujours en file");
	assert.equal(second.refusRegles["3-masquage"], 1, "on : refus recompté au passage");
	assert.equal((await refusJournal(fact.contentHash)).length, 1, "le refus n'est pas réécrit");
	sansDrapeau();
});

test("S3.1 — drapeau on, voie manuelle : la promotion de l'analyste reste posée, le rattachement du moteur est refusé", async () => {
	const org = await insertOrg(`F H ${TAG} c`);
	const fact = await insertFact(`F*****H ${TAG} c`);
	avecDrapeau("on");
	const r = await promoteOne(fact.id, "analyste@example.invalid");
	assert.equal(r.found, true);
	assert.equal(r.alreadyPromoted, false);
	assert.equal(r.refuseParRegle, "3-masquage", "le résultat dit quelle règle a refusé");
	assert.equal(r.orgId, org, "le résultat expose ce que le moteur a trouvé");
	assert.equal(await eventOrgId(fact.contentHash), null, "l'événement est posé non rattaché");
	const trace = await refusJournal(fact.contentHash);
	assert.equal(trace.length, 1);
	assert.equal(trace[0]?.regle, "3-masquage");
	sansDrapeau();
});

test("S3.2 — drapeau on : les cas sûrs continuent d'être rattachés (domaine = clé, égalité de nom)", async () => {
	const orgDomain = await insertOrg(`Organisation Sure ${TAG}`, { domain: `sure-${TAG}.example` });
	// la désambiguïsation des homonymes de communes exige une commune : sans elle,
	// « Libournais » est ambigu et le rattachement par nom est refusé (comportement voulu).
	const orgNom = await insertOrg(`Château Haut Brion Libournais ${TAG}`, { city: "Libourne" });
	const faitDomaine = await insertFact(`sure-${TAG}.example`);
	const faitNom = await insertFact(`Château Haut Brion Libournais ${TAG}`);

	avecDrapeau("on");
	const r = await promoteMatches(false, { ids: [faitDomaine.id, faitNom.id], log: () => {} });
	assert.equal(r.matched, 2, "on : les deux rattachements sûrs passent");
	assert.equal(r.promoted, 2);
	assert.deepEqual(r.refusRegles, {}, "on : aucun refus sur les cas sûrs");
	assert.equal(await eventOrgId(faitDomaine.contentHash), orgDomain, "le chemin domaine reste une clé");
	assert.equal(await eventOrgId(faitNom.contentHash), orgNom, "l'égalité de nom reste produite");
	sansDrapeau();
});
