/**
 * Rapport mensuel : un test par comportement observable.
 *
 * Les requêtes réelles sont exercées sur la base de test créée par `test/run.ts`
 * avec des données explicitement insérées dans un mois isolé (2027-03).
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import {
	DEPTS_NA,
	SQL,
	fenetreMois,
	genererRapportMensuel,
	rendreRapportMensuel,
	type DonneesRapportMensuel,
} from "../src/analyse/rapport-mensuel.js";

const MOIS = "2027-03";
const PREFIXE = "rapport-mensuel-test";

async function installer(): Promise<void> {
	await query(
		`INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'ransomware', 'https://example.invalid/rapport')
		 ON CONFLICT (id) DO NOTHING`,
		[`${PREFIXE}-src`, "Source test rapport"],
	);
	await query(
		`INSERT INTO org (name, slug, kind, sector, dept) VALUES
		 ($1, $2, 'entreprise', 'sante-social', '33'),
		 ($3, $4, 'collectivite', NULL, '17'),
		 ($5, $6, 'entreprise', 'numerique', '93')
		 ON CONFLICT (slug) DO NOTHING`,
		[
			`${PREFIXE}-a`, `${PREFIXE}-a`,
			`${PREFIXE}-b`, `${PREFIXE}-b`,
			`${PREFIXE}-hors-na`, `${PREFIXE}-hors-na`,
		],
	);
	const orgs = await query<{ slug: string; id: number }>(
		"SELECT slug, id FROM org WHERE slug LIKE $1",
		[`${PREFIXE}-%`],
	);
	const id = (suffixe: string): number => orgs.rows.find((ligne) => ligne.slug === `${PREFIXE}-${suffixe}`)?.id ?? 0;

	const lignes: unknown[][] = [];
	for (let i = 1; i <= 12; i++) {
		const jour = String(i).padStart(2, "0");
		const observed = `2027-03-${jour}T12:00:00Z`;
		const collected = new Date(Date.parse(observed) + i * 3_600_000).toISOString();
		lignes.push([
			`${PREFIXE}-event-${i}`,
			"ransomware",
			"third_party_claim",
			`Victime ${i} — revendiqué par test`,
			orgs.rows.find((ligne) => ligne.slug === `${PREFIXE}-${i % 2 === 0 ? "b" : "a"}`)?.id ?? id("a"),
			i === 1 ? 5 : 4,
			observed,
			collected,
			`${PREFIXE}-src`,
			`https://example.invalid/rapport/${i}`,
			"2027-03-01T00:00:00Z",
			"CLEAR",
		]);
	}
	// Une revendication non rattachée compte au dénominateur de la couverture.
	lignes.push([
		`${PREFIXE}-event-sans-org`, "ransomware", "third_party_claim", "Sans org", null, 3,
		"2027-03-13T12:00:00Z", "2027-03-13T13:00:00Z", `${PREFIXE}-src`, null, "2027-03-13T13:00:00Z", "CLEAR",
	]);
	lignes.push([
		`${PREFIXE}-event-hors-na`, "ransomware", "third_party_claim", "Hors NA", id("hors-na"), 3,
		"2027-03-14T12:00:00Z", "2027-03-14T13:00:00Z", `${PREFIXE}-src`, null, "2027-03-14T13:00:00Z", "CLEAR",
	]);
	lignes.push([
		`${PREFIXE}-event-indicateur`, "vuln", "technical_indicator", "Indicateur", id("a"), 5,
		"2027-03-15T12:00:00Z", "2027-03-15T13:00:00Z", `${PREFIXE}-src`, null, "2027-03-15T13:00:00Z", "CLEAR",
	]);
	lignes.push([
		`${PREFIXE}-event-fevrier`, "ransomware", "third_party_claim", "Février", id("a"), 3,
		"2027-02-28T12:00:00Z", "2027-03-01T13:00:00Z", `${PREFIXE}-src`, null, "2027-03-01T13:00:00Z", "CLEAR",
	]);
	// Un fait TLP:RED ne doit jamais entrer dans un rapport public, même gravissime.
	lignes.push([
		`${PREFIXE}-event-tlp-red`, "ransomware", "third_party_claim", "Fait non publiable", id("a"), 5,
		"2027-03-16T12:00:00Z", "2027-03-16T13:00:00Z", `${PREFIXE}-src`, null, "2027-03-16T13:00:00Z", "RED",
	]);
	await query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, org_id, severity,
		 observed_at, collected_at, source_id, source_url, created_at, tlp, evidence)
		 VALUES (${lignes[0]!.map((_, i) => (i === 9 ? `COALESCE($${i + 1}, 'https://example.invalid/event')` : `$${i + 1}`)).join(", ")}, '{"run_id":"1"}'::jsonb)
		 ON CONFLICT (dedup_key) DO NOTHING`,
		lignes[0],
	);
	for (const ligne of lignes.slice(1)) {
		await query(
			`INSERT INTO event (dedup_key, family, assertion_type, title, org_id, severity,
			 observed_at, collected_at, source_id, source_url, created_at, tlp, evidence)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'https://example.invalid/event'), $11, $12, '{"run_id":"1"}'::jsonb)
			 ON CONFLICT (dedup_key) DO NOTHING`,
			ligne,
		);
	}
}

await installer();

after(async () => {
	await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${PREFIXE}-%`]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIXE}-%`]);
	await query("DELETE FROM source WHERE id = $1", [`${PREFIXE}-src`]);
});

async function rapport(): Promise<DonneesRapportMensuel> {
	return genererRapportMensuel(MOIS, query);
}

test("la fenêtre est strictement délimitée et le mois rejeté est explicite", () => {
	assert.deepEqual(fenetreMois("2026-11"), { debut: "2026-11-01", fin: "2026-12-01" });
	assert.deepEqual(fenetreMois("2026-12"), { debut: "2026-12-01", fin: "2027-01-01" });
	assert.throws(() => fenetreMois("2026-13"), /mois invalide/);
	for (const sql of Object.values(SQL)) assert.doesNotMatch(sql, /\bnow\(\)/);
});

test("seuls les incidents du mois rattachés aux douze départements sont comptés", async () => {
	const donnees = await rapport();
	assert.equal(donnees.incidents, 12);
	assert.deepEqual(donnees.departements, [
		{ dept: "17", incidents: 6, orgs: 1 },
		{ dept: "33", incidents: 6, orgs: 1 },
	]);
	assert.deepEqual(donnees.secteurs, [
		{ secteur: "collectivite", incidents: 6 },
		{ secteur: "sante-social", incidents: 6 },
	]);
	assert.deepEqual(donnees.sources, [{ source_id: `${PREFIXE}-src`, incidents: 12 }]);
	assert.equal(DEPTS_NA.includes("93"), false);
});

test("le délai médian et la couverture viennent des requêtes, pas d'une estimation", async () => {
	const donnees = await rapport();
	assert.equal(donnees.delaiEffectif, 12);
	assert.equal(donnees.delaiHeures, 6.5);
	assert.deepEqual(donnees.couverture, { rattaches: 12, total: 14, pourcent: 85.7 });
	const markdown = rendreRapportMensuel(donnees);
	assert.match(markdown, /\| Délai médian \| 6,5 h \|/);
	assert.match(markdown, /\| Couverture de rattachement \| 85,7 % \| 12 incidents rattachés/);
});

test("le palmarès est plafonné à dix incidents, trié et lié à sa source", async () => {
	const donnees = await rapport();
	assert.equal(donnees.top.length, 10);
	assert.equal(donnees.top[0]?.severite, 5);
	assert.equal(donnees.top[0]?.source_id, `${PREFIXE}-src`);
	assert.equal(donnees.top[0]?.source_url, `https://example.invalid/rapport/1`);
	const lignes = rendreRapportMensuel(donnees).split("\n").filter((ligne) => ligne.startsWith("| 2027-03-"));
	assert.equal(lignes.length, 10);
	assert.match(lignes[0]!, /\(\`rapport-mensuel-test-src\`\)/);
	const dates = lignes.map((ligne) => ligne.slice(2, 12));
	assert.equal(dates[0], "2027-03-01");
	assert.deepEqual(dates.slice(1), [...dates.slice(1)].sort().reverse());
});

test("deux générations sont octet pour octet identiques", async () => {
	const premier = rendreRapportMensuel(await rapport());
	const second = rendreRapportMensuel(await rapport());
	assert.equal(second, premier);
	assert.equal(premier.includes("2027-03-01 → 2027-04-01"), true);
	assert.doesNotMatch(premier, /NaN|undefined/);
});

test("un mois sans incident rend un document lisible, sans division par zéro", () => {
	const vide: DonneesRapportMensuel = {
		mois: "2027-01",
		derniereCollecte: null,
		incidents: 0,
		departements: [],
		secteurs: [],
		sources: [],
		delaiHeures: null,
		delaiEffectif: 0,
		couverture: { rattaches: 0, total: 0, pourcent: null },
		top: [],
	};
	const markdown = rendreRapportMensuel(vide);
	assert.match(markdown, /\| Délai médian \| non mesuré \|/);
	assert.match(markdown, /\| Couverture de rattachement \| non mesuré \|/);
	assert.match(markdown, /\*Aucun incident régional ce mois-ci\*/);
	assert.doesNotMatch(markdown, /NaN|undefined/);
});
