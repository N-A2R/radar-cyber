/**
 * BODACC — procédures collectives par SIREN.
 *
 * Deux garanties sont testées ici, séparément :
 *  - le mapping pur : une annonce ne devient un événement que si le SIREN,
 *    l'URL d'annonce et la date de parution sont présents, et aucune donnée
 *    personnelle d'une personne physique n'est recopiée ;
 *  - la contrainte SQL : la base refuse un événement `bodacc` sans preuve,
 *    quelle que soit la voie d'écriture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestQuery } from "../src/db.js";
import {
	BODACC_FENETRE_JOURS,
	BODACC_REGION_CODE,
	collector,
	cutoffJour,
	denominationMorale,
	mapBodaccRecord,
	sirenDepuisRegistre,
	urlPageBodacc,
	type BodaccRecord,
} from "../src/collectors/bodacc.collector.js";
import type { CollectContext } from "@radar/shared";

const JOUR = "2026-11-22";
const CUTOFF = "2026-10-23";

const pm: BodaccRecord = {
	id: "A202602243434",
	dateparution: JOUR,
	typeavis_lib: "Avis initial",
	familleavis: "collective",
	registre: ["898815808", "898 815 808"],
	url_complete: "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A202602243434",
	numerodepartement: "33",
	departement_nom_officiel: "Gironde",
	region_code: 75,
	tribunal: "Greffe du Tribunal de Commerce de Bordeaux",
	ville: "Bordeaux",
	commercant: "CARRELAGE 66",
	numeroannonce: 3434,
	jugement: JSON.stringify({ type: "initial", nature: "Jugement d'ouverture de liquidation judiciaire" }),
	listepersonnes: JSON.stringify({
		personne: { typePersonne: "pm", denomination: "CARRELAGE 66" },
	}),
};

test("une annonce complète devient un événement bodacc daté et sourcé", () => {
	const ev = mapBodaccRecord(pm, CUTOFF);
	assert.ok(ev);
	assert.equal(ev.family, "bodacc");
	assert.equal(ev.dedupKey, "bodacc:A202602243434");
	assert.equal(ev.observedAt, "2026-11-22T00:00:00.000Z");
	assert.equal(ev.sourceId, "bodacc:pc-na");
	assert.equal(ev.sourceUrl, "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A202602243434");
	assert.equal(ev.evidence["siren"], "898815808");
	assert.equal(ev.evidence["url_bodacc"], ev.sourceUrl);
	assert.equal(ev.evidence["region_code"], BODACC_REGION_CODE);
	assert.match(ev.title, /^Liquidation judiciaire — CARRELAGE 66 \(Bordeaux\)$/);
	assert.match(ev.summary ?? "", /Gironde/);
});

test("un dossier de personne physique ne recopie ni nom ni adresse", () => {
	const pp: BodaccRecord = {
		...pm,
		id: "A202602249999",
		commercant: "DUPONT, Jean, Pierre",
		listepersonnes: JSON.stringify({
			personne: {
				typePersonne: "pp",
				nom: "DUPONT",
				prenom: "Jean, Pierre",
				adresseSiegeSocial: { nomVoie: "1 rue du Secret", codePostal: "33000", ville: "Bordeaux" },
			},
		}),
		jugement: JSON.stringify({ nature: "Jugement d'ouverture de redressement judiciaire" }),
	};
	const ev = mapBodaccRecord(pp, CUTOFF);
	assert.ok(ev);
	assert.equal(ev.evidence["siren"], "898815808");
	assert.equal(ev.evidence["nature_jugement"], "Jugement d'ouverture de redressement judiciaire");
	const trace = JSON.stringify(ev);
	for (const interdit of ["DUPONT", "Jean", "rue du Secret", "33000"]) {
		assert.equal(trace.includes(interdit), false, `« ${interdit} » ne doit pas être stocké`);
	}
	assert.match(ev.title, /SIREN 898815808/);
});

test("sans SIREN, sans URL ou hors région, pas d'événement", () => {
	assert.equal(mapBodaccRecord({ ...pm, registre: ["12345"] }, CUTOFF), null);
	assert.equal(mapBodaccRecord({ ...pm, id: "", url_complete: null }, CUTOFF), null);
	const repli = mapBodaccRecord({ ...pm, url_complete: null }, CUTOFF);
	assert.equal(repli?.evidence["url_bodacc"], "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A202602243434");
	assert.equal(mapBodaccRecord({ ...pm, region_code: 11 }, CUTOFF), null);
	assert.equal(mapBodaccRecord({ ...pm, familleavis: "civile" }, CUTOFF), null);
	assert.equal(mapBodaccRecord({ ...pm, dateparution: "2026-01-01" }, CUTOFF), null);
});

test("les utilitaires de preuve restent stricts", () => {
	assert.equal(sirenDepuisRegistre(["898 815 808"]), "898815808");
	assert.equal(sirenDepuisRegistre("898815808"), "898815808");
	assert.equal(sirenDepuisRegistre(["89881580A"]), null);
	assert.equal(denominationMorale(JSON.stringify({ personne: { typePersonne: "pp", nom: "X" } })), null);
	assert.equal(denominationMorale("pas du json"), null);
	const params = new URL(urlPageBodacc(100, CUTOFF)).searchParams;
	assert.match(params.get("where") ?? "", /familleavis="collective"/);
	assert.match(params.get("where") ?? "", /region_code=75/);
	assert.match(params.get("where") ?? "", /dateparution>="2026-10-23"/);
	assert.equal(params.get("offset"), "100");
	assert.equal(cutoffJour(new Date("2026-11-22T12:00:00Z"), BODACC_FENETRE_JOURS), CUTOFF);
});

test("le collecteur pagine, déduplique et s'arrête avant la fenêtre", async () => {
	// Une page pleine (100) force la page suivante ; la page 2 contient un
	// doublon, puis une annonce antérieure à la fenêtre qui arrête la lecture.
	const page1: BodaccRecord[] = Array.from({ length: 100 }, (_, i) => ({
		...pm,
		id: `A20260224${String(1000 + i)}`,
		registre: [String(400000000 + i)],
	}));
	const page2: BodaccRecord[] = [
		{ ...pm, id: "A202602241000", registre: ["400000000"] },
		{ ...pm, id: "A199900000001", dateparution: "2026-01-01" },
	];
	const pages = [page1, page2];
	const appels: string[] = [];
	const ctx: CollectContext = {
		async fetchJson<T>(url: string): Promise<T> {
			appels.push(url);
			return { results: pages[appels.length - 1] ?? [] } as T;
		},
		async fetchText(): Promise<string> {
			throw new Error("fetchText ne doit pas être appelé");
		},
		cursor: {},
		log() {},
		now: () => new Date("2026-11-22T12:00:00Z"),
	};
	const result = await collector.run(ctx);
	assert.equal(result.events.length, 100);
	assert.equal(new Set(result.events.map((e) => e.dedupKey)).size, 100);
	assert.equal(appels.length, 2, "une page plus vieille que la fenêtre arrête la pagination");
	assert.equal(result.cursor?.["derniereParution"], "2026-11-22");
});

test("la base refuse un événement bodacc sans SIREN ni URL d'annonce", async () => {
	const base = {
		assertion_type: "confirmed_incident",
		source_id: "bodacc:pc-na",
	};
	await assert.rejects(
		ingestQuery(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, evidence)
			 VALUES ($1, 'bodacc', $2, 'Liquidation judiciaire — test', $3, now(), $4::jsonb)`,
			["bodacc:sans-siren", base.assertion_type, base.source_id, JSON.stringify({ url_bodacc: "https://www.bodacc.fr/x" })]
		),
		/event_bodacc_preuve_check/
	);

	await assert.rejects(
		ingestQuery(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, evidence)
			 VALUES ($1, 'bodacc', $2, 'Liquidation judiciaire — test', $3, now(), $4::jsonb)`,
			["bodacc:sans-url", base.assertion_type, base.source_id, JSON.stringify({ siren: "898815808" })]
		),
		/event_bodacc_preuve_check/
	);

	await ingestQuery(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, observed_at, evidence)
		 VALUES ($1, 'bodacc', $2, 'Liquidation judiciaire — test', $3, now(), $4::jsonb)`,
		[
			"bodacc:preuve-complete",
			base.assertion_type,
			base.source_id,
			JSON.stringify({ siren: "898815808", url_bodacc: "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A1" }),
		]
	);
	const { rows } = await ingestQuery<{ url: string | null; siren: string | null }>(
		`SELECT evidence->>'url_bodacc' AS url, evidence->>'siren' AS siren FROM event WHERE dedup_key = $1`,
		["bodacc:preuve-complete"]
	);
	assert.deepEqual(rows[0], {
		url: "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:A1",
		siren: "898815808",
	});
});
