/**
 * Instantané J-21 : la borne est prouvée sur des données synthétiques.
 *
 * Le corpus réel ne contient aucun signe précurseur. Pour savoir si le zéro
 * vient du mécanisme ou des données, on fabrique ici un incident avec un
 * signal avant J-21 et un signal après : le premier doit être retenu, le
 * second ne doit jamais apparaître, même avec un `observed_at` trompeur.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import {
	SQL,
	bornesFenetre,
	construireInstantane,
	dateDuJour,
	filtrerEvenements,
	type EvenementBrut,
	type HistoriqueReel,
	type OrganisationBrut,
	type SourceBrut,
	type TotauxBrut,
} from "../src/analyse/instantane-anticipation.js";
import { genererRapport, type IncidentCorpus, type Instantane } from "../src/analyse/rapport-anticipation.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `antic${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCE = `${TAG}-source`;
const ENTITE = "Synthetic Marine Fountain";
const INCIDENT: IncidentCorpus = {
	id: `${TAG}-incident`,
	entite: ENTITE,
	dateIncident: "2026-06-15",
	commune: "Bordeaux",
};
const BORNES = bornesFenetre(dateDuJour(INCIDENT.dateIncident!));
const PARAMS = [BORNES.debut, BORNES.fin];

const TITRE_AVANT = "Synthetic Marine Fountain : anomalies relevées avant l'incident";
const TITRE_BORNE = "Veille internationale sans rapport avec l'entité";
const TITRE_APRES = "Synthetic Marine Fountain revendique une fuite après l'incident";
const TITRE_ANCIEN = "Synthetic Marine Fountain : fait ancien hors fenêtre";

let orgId: number;

before(async () => {
	await query(
		`INSERT INTO source (id, name, family, url, enabled)
		 VALUES ($1, $2, 'cti', $3, true)`,
		[SOURCE, `Source synthétique ${TAG}`, `https://exemple.invalid/${TAG}`],
	);
	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept) VALUES ($1, $2, 'entreprise', '33') RETURNING id`,
		[ENTITE, `${TAG}-org`],
	);
	orgId = Number(org.rows[0]?.id);

	// `valid_at` décide ; `observed_at` et `collected_at` sont volontairement
	// incohérents pour prouver qu'ils ne servent pas de critère.
	const faits = [
		{
			cle: "dedans",
			titre: TITRE_AVANT,
			valid_at: "2026-05-10T12:00:00.000Z",
			observed_at: "2026-06-15T00:00:00.000Z",
			collected_at: "2026-05-10T08:00:00.000Z",
			assertion: "ambient_signal",
			org_id: orgId,
		},
		{
			cle: "borne",
			titre: TITRE_BORNE,
			valid_at: "2026-05-25T23:59:59.000Z",
			observed_at: "2026-05-25T23:59:59.000Z",
			collected_at: "2026-05-10T08:00:00.000Z",
			assertion: "ambient_signal",
			org_id: null,
		},
		{
			cle: "apres",
			titre: TITRE_APRES,
			valid_at: "2026-05-26T00:00:00.000Z",
			observed_at: "2026-05-01T00:00:00.000Z",
			collected_at: "2026-05-11T08:00:00.000Z",
			assertion: "third_party_claim",
			org_id: null,
		},
		{
			cle: "ancien",
			titre: TITRE_ANCIEN,
			valid_at: "2026-05-04T23:59:59.000Z",
			observed_at: "2026-05-10T12:00:00.000Z",
			collected_at: "2026-05-12T08:00:00.000Z",
			assertion: "ambient_signal",
			org_id: null,
		},
	] as const;

	for (const fait of faits) {
		await query(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id,
			                    observed_at, valid_at, collected_at, source_url, evidence)
			 VALUES ($1, 'cti', $2, $3, $4, $5, $6, $7, $8, 'https://example.invalid/event', '{"run_id":"1"}'::jsonb)`,
			[
				`${TAG}:${fait.cle}`,
				fait.assertion,
				fait.titre,
				SOURCE,
				fait.org_id,
				fait.observed_at,
				fait.valid_at,
				fait.collected_at,
			],
		);
	}
});

after(async () => {
	await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
	await query("DELETE FROM source WHERE id = $1", [SOURCE]);
	if (orgId) await query("DELETE FROM org WHERE id = $1", [orgId]);
	await closePools();
});

test("le SQL et la barrière mémoire excluent tout valid_at postérieur à J-21", async () => {
	// Le SQL de mesure porte sur tout le corpus : on isole ici la source
	// synthétique, sinon les faits des autres fichiers polluent l'assertion.
	const { rows: enFenetre } = await query<EvenementBrut>(SQL.evenements, PARAMS);
	assert.deepEqual(
		enFenetre.filter((e) => e.source_id === SOURCE).map((e) => e.titre),
		[TITRE_AVANT, TITRE_BORNE],
		"J-21 inclus, J-20 exclu, aucun événement postérieur",
	);

	const { rows: tous } = await query<EvenementBrut>(
		`SELECT e.id, e.family, e.assertion_type, left(e.title, 200) AS titre,
		        e.valid_at, e.source_id, e.org_id
		   FROM event e WHERE e.source_id = $1 ORDER BY e.valid_at, e.id`,
		[SOURCE],
	);
	const { retenus, horsBorne } = filtrerEvenements(tous, BORNES);
	assert.equal(horsBorne, 2, "deux événements tentent de franchir la borne");
	assert.deepEqual(retenus.map((e) => e.titre), [TITRE_AVANT, TITRE_BORNE]);
	assert.ok(!retenus.some((e) => e.titre === TITRE_APRES));
});

test("le mécanisme complet retient un signal synthétique antérieur, pas le postérieur", async () => {
	const { rows: evenements } = await query<EvenementBrut>(SQL.evenements, PARAMS);
	const { retenus } = filtrerEvenements(evenements, BORNES);
	const { rows: sources } = await query<SourceBrut>(SQL.sources, PARAMS);
	const { rows: organisations } = await query<OrganisationBrut>(SQL.organisations, PARAMS);
	const { rows: totaux } = await query<TotauxBrut>(SQL.totaux, PARAMS);

	const ligne = construireInstantane(
		{
			id: INCIDENT.id!,
			entite: ENTITE,
			dateReference: INCIDENT.dateIncident!,
			typeReference: "dateIncident",
		},
		BORNES,
		retenus,
		sources,
		organisations,
		totaux,
	);
	const instantane = JSON.parse(JSON.stringify(ligne)) as Instantane;
	const rapport = genererRapport({ corpus: [INCIDENT], instantanes: [instantane] });

	assert.equal(rapport.dossiers[0]?.verdict, "signal");
	assert.equal(rapport.resume.avecSignal, 1);
	assert.equal(rapport.dossiers[0]?.retenus[0]?.titre, TITRE_AVANT);
	assert.ok(!rapport.markdown.includes(TITRE_APRES), "le signal post-J-21 n'est pas publié");
	assert.ok(!rapport.markdown.includes(TITRE_ANCIEN), "le signal antérieur à la fenêtre n'est pas publié");
});

test("l'historique réel compte les jours de collecte, pas l'ancienneté des valid_at", async () => {
	// La base de test est partagée : limiter la mesure à la source synthétique
	// garantit que les événements des autres suites ne changent pas le résultat.
	const { rows } = await query<HistoriqueReel>(SQL.historique, [SOURCE]);
	const mesure = rows[0];
	assert.ok(mesure);
	assert.equal(mesure.jours_avec_collecte, 3);
	assert.equal(mesure.jours_calendaires, 3);
	assert.equal(mesure.premiere_collecte, "2026-05-10");
	assert.equal(mesure.derniere_collecte, "2026-05-12");
	assert.equal(mesure.evenements, 4);
});
