/**
 * Un test par comportement observable du regroupement en campagnes.
 * Les trois premiers sont purs ; le dernier vérifie l'écriture en base et la
 * preuve qui y est stockée.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	analyserCampagnes,
	enregistrerCampagnes,
	type EvenementCampagne,
} from "../src/analyse/campagnes.js";

function evenement(id: number, overrides: Partial<EvenementCampagne> = {}): EvenementCampagne {
	return {
		id,
		family: "ransomware",
		title: "victime.example — revendiqué par inconnu",
		observedAt: "2026-11-14T10:00:00.000Z",
		sourceId: "ransomlook",
		sourceUrl: null,
		orgId: null,
		sector: null,
		evidence: {},
		...overrides,
	};
}

test("deux revendications du même groupe, de deux sources différentes, forment une seule campagne", () => {
	const analyse = analyserCampagnes([
		evenement(1, {
			title: "alpha.example — revendiqué par Qilin",
			evidence: { group: "qilin" },
			observedAt: "2026-11-14T10:00:00.000Z",
		}),
		evenement(2, {
			sourceId: "onion:ccw:qilin",
			sourceUrl: "http://qilin7abc.onion/",
			title: "beta.example",
			observedAt: "2026-11-16T10:00:00.000Z",
		}),
		evenement(3, {
			title: "gamma.example — revendiqué par cactus",
			evidence: { group: "cactus" },
			observedAt: "2026-11-15T10:00:00.000Z",
		}),
		evenement(4, {
			evidence: { group: "qilin" },
			observedAt: "2026-12-20T10:00:00.000Z",
		}),
	]);

	const campagneQilin = analyse.campagnes.find((c) => c.label === "qilin");
	assert.ok(campagneQilin, "le groupe qilin doit être reconnu comme une campagne");
	assert.deepEqual(campagneQilin.incidents, [1, 2]);
	assert.deepEqual(campagneQilin.sourceIds, ["onion:ccw:qilin", "ransomlook"]);
	assert.deepEqual(campagneQilin.preuve.signaux[0], {
		type: "groupe",
		valeur: "qilin",
		evenements: [1, 2],
	});
	assert.equal(campagneQilin.preuve.liens.length, 1);
	assert.equal(campagneQilin.preuve.liens[0]?.motif, "groupe:qilin");
	assert.ok(campagneQilin.preuve.liens[0]?.delaiHeures === 48);
	assert.equal(campagneQilin.confiance, "moyen");
	assert.ok(!campagneQilin.incidents.includes(3), "un autre groupe reste distinct");
	assert.deepEqual(
		analyse.isoles,
		[
			{ id: 3, raison: "sans_voisin" },
			{ id: 4, raison: "sans_voisin" },
		],
		"les revendications sans voisin restent isolées, y compris l'autre groupe",
	);
});

test("la réutilisation d'infrastructure regroupe des incidents sans groupe connu", () => {
	const analyse = analyserCampagnes([
		evenement(11, {
			sourceId: "cti-feed",
			evidence: { ip: "198.51.100.42" },
			observedAt: "2026-11-13T08:00:00.000Z",
		}),
		evenement(12, {
			sourceId: "autre-feed",
			evidence: { certificate: "a".repeat(48) },
			title: "deuxième incident",
			observedAt: "2026-11-15T08:00:00.000Z",
		}),
		evenement(13, {
			sourceId: "autre-feed",
			evidence: { ip: "198.51.100.42" },
			observedAt: "2026-11-16T08:00:00.000Z",
		}),
	]);

	const campagne = analyse.campagnes.find((c) => c.incidents.includes(11));
	assert.ok(campagne);
	assert.deepEqual(campagne.incidents, [11, 13]);
	assert.equal(campagne.preuve.liens[0]?.motif, "infrastructure:198.51.100.42");
	assert.equal(analyse.isoles[0]?.id, 12, "un certificat différent ne rejoint pas la campagne");
});

test("secteur et vecteur seuls ne fabriquent pas de campagne", () => {
	const vecteur = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
	const analyse = analyserCampagnes([
		evenement(21, {
			family: "vuln",
			sourceId: "cisa_kev",
			sector: "sante",
			evidence: { vectorString: vecteur },
		}),
		evenement(22, {
			family: "vuln",
			sourceId: "cisa_kev",
			sector: "sante",
			evidence: { vectorString: vecteur },
			observedAt: "2026-11-15T10:00:00.000Z",
		}),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
	assert.deepEqual(analyse.isoles.map((i) => i.raison), ["sans_ancre", "sans_ancre"]);
});

test("une organisation avec même secteur et même vecteur fournit une ancre", () => {
	const vecteur = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
	const analyse = analyserCampagnes([
		evenement(31, {
			family: "vuln",
			orgId: 7,
			sector: "sante",
			evidence: { vectorString: vecteur },
		}),
		evenement(32, {
			family: "vuln",
			orgId: 7,
			sector: "sante",
			evidence: { vectorString: vecteur },
			observedAt: "2026-12-01T10:00:00.000Z",
		}),
		evenement(33, {
			family: "vuln",
			orgId: 7,
			sector: "industrie",
			evidence: { vectorString: vecteur },
			observedAt: "2026-11-20T10:00:00.000Z",
		}),
	]);

	const campagne = analyse.campagnes.find((c) => c.incidents.includes(31));
	assert.ok(campagne);
	assert.deepEqual(campagne.incidents, [31, 32]);
	assert.equal(campagne.preuve.liens[0]?.motif, "organisation:org:7");
	assert.ok(analyse.isoles.some((i) => i.id === 33));
});

const TAG = `cmp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const creees: number[] = [];

after(async () => {
	if (creees.length > 0) await query("DELETE FROM event WHERE id = ANY($1)", [creees]);
	await query("DELETE FROM campaign WHERE label = $1", [`campagnetest${TAG}`]);
	await closePools().catch(() => {});
});

test("la campagne est écrite en base avec sa liste d'incidents et sa preuve", async () => {
	const label = `campagne-test-${TAG}`;
	const evenements: EvenementCampagne[] = [];
	for (const [i, date] of ["2026-11-14T10:00:00Z", "2026-11-16T10:00:00Z"].entries()) {
		const insere = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, evidence)
			 VALUES ($1, 'ransomware', 'third_party_claim', $2, $3, 'ransomlook', $4)
			 RETURNING id`,
			[`${TAG}-${i}`, `${label} victime ${i}`, date, JSON.stringify({ group: label })],
		);
		const id = Number(insere.rows[0]?.id);
		creees.push(id);
		evenements.push(
			evenement(id, {
				title: `${label} victime ${i}`,
				observedAt: date,
				evidence: { group: label },
			}),
		);
	}

	const analyse = analyserCampagnes(evenements);
	assert.equal(analyse.campagnes.length, 1);
	const ecriture = await enregistrerCampagnes(analyse.campagnes);
	assert.equal(ecriture.ecrites, 1);

	const lus = await query<{
		cle: string;
		incidents: number[];
		confiance: string;
		preuve: { signaux: { valeur: string; evenements: number[] }[] };
	}>("SELECT cle, incidents, confiance, preuve FROM campaign WHERE label = $1", [label.replace(/-/g, "")]);
	assert.equal(lus.rows.length, 1);
	const rangee = lus.rows[0];
	assert.ok(rangee);
	assert.deepEqual(rangee.incidents.map(Number), creees);
	assert.equal(rangee.preuve.signaux[0]?.valeur, label.replace(/-/g, ""));
	assert.deepEqual(rangee.preuve.signaux[0]?.evenements, creees);
	assert.equal(rangee.confiance, "faible");

	const nettoyage = await enregistrerCampagnes([]);
	assert.equal(nettoyage.ecrites, 0);
	const restantes = await query("SELECT 1 FROM campaign WHERE label = $1", [label]);
	assert.equal(restantes.rowCount, 0, "un passage sans campagne retire les anciennes lignes");
});
