/**
 * Flux MISP public du CERT-FR : admission TLP:CLEAR, corpus durable sans perte
 * utile, UUID conservé dans la preuve, puis corrélation quotidienne
 * observable en base.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { CollectContext } from "@radar/shared";
import { closePools, query } from "../src/db.js";
import { admitEvent } from "../src/contract/admit.js";
import {
	collector, corpusDepuisFluxMisp, estTlpClear, eventNormalise, parserManifeste,
	enregistrerCorpusMisp, CERTFR_MISP_SOURCE_ID, CERTFR_MISP_MANIFEST_URL,
} from "../src/collectors/certfr-misp.collector.js";
import { correlaterIndicateursCertfrMisp } from "../src/collectors/certfr-misp-correlate.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const UUID_CLEAR = "11111111-2222-4333-8444-555555555555";
const UUID_AMBER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UUID_MAZE = "33333333-4444-5555-8666-777777777777";
const HASH_SHA256 = "a".repeat(64);
const TAG = `misptest${Date.now().toString(36)}`;

function manifesteFaux(): unknown {
	return {
		[UUID_CLEAR]: {
			uuid: UUID_CLEAR, date: "2026-11-10", info: "[CERT-FR] Campagne Sandworm",
			Orgc: { name: "CERT-FR" },
			Tag: [
				{ name: "tlp:clear" },
				{ name: 'cert-fr:fiabilite="Bonne"' },
				{ name: 'misp-galaxy:threat-actor="Sandworm"' },
			],
		},
		[UUID_AMBER]: {
			uuid: UUID_AMBER, date: "2026-11-11", info: "Document classifié",
			Tag: [{ name: "tlp:amber" }],
		},
	};
}

function corpsFaux(): Record<string, unknown> {
	return {
		[UUID_CLEAR]: {
			Event: {
				uuid: UUID_CLEAR, date: "2026-11-10", info: "[CERT-FR] Campagne Sandworm",
				Orgc: { name: "CERT-FR" },
				Tag: [
					{ name: "tlp:clear" },
					{ name: 'cert-fr:fiabilite="Bonne"' },
					{ name: 'misp-galaxy:threat-actor="Sandworm"' },
				],
				Attribute: [
					{ type: "domain", value: "phishing.example.test" },
					{ type: "email-src", value: "une.personne@example.test" },
					{ type: "target-location", value: "France" },
				],
				Object: [{
					name: "file",
					Attribute: [
						{ type: "sha256", value: HASH_SHA256 },
						{ type: "filename", value: "dropper.exe" },
					],
				}],
			},
		},
		[UUID_AMBER]: {
			Event: { uuid: UUID_AMBER, date: "2026-11-11", info: "Document classifié", Tag: [{ name: "tlp:amber" }], Attribute: [] },
		},
	};
}

test("TLP:CLEAR explicite : le marquage amber est refusé", () => {
	assert.equal(estTlpClear([{ name: "tlp:clear" }]), true);
	assert.equal(estTlpClear(['cert-fr:TLP="clear"']), true);
	assert.equal(estTlpClear([{ name: "tlp:white" }]), true);
	assert.equal(estTlpClear([{ name: "tlp:amber" }]), false);
	assert.equal(estTlpClear([{ name: "tlp:clear" }, { name: "tlp:green" }]), false);
	assert.equal(parserManifeste(manifesteFaux()).length, 2);
	assert.equal(parserManifeste({ Event: [{ uuid: UUID_CLEAR, date: "2026-11-10" }] }).length, 1);
});

test("corpus MISP : attributs d'objet conservés, données personnelles écartées", () => {
	const corpus = corpusDepuisFluxMisp(manifesteFaux(), corpsFaux());
	assert.equal(corpus.length, 1, "seul l'événement TLP:CLEAR est admis");
	const evenement = corpus[0]!;
	assert.equal(evenement.uuid, UUID_CLEAR);
	assert.equal(evenement.confidence, "B2");
	const valeurs = evenement.indicateurs.map((i) => `${i.type}:${i.value}`).sort();
	assert.deepEqual(valeurs, [
		`domain:phishing.example.test`,
		`filename:dropper.exe`,
		`sha256:${HASH_SHA256}`,
	], "attributs directs et attributs d'objet, rien de perdu");
	assert.deepEqual(evenement.contexte.targetLocations, ["France"]);
	assert.ok(evenement.contexte.labels.includes("sandworm"));
	assert.equal(evenement.objetsLus, 1);
	assert.equal(evenement.typesComptes["email-src"], undefined, "un type personnel n'est même pas compté");
	assert.doesNotMatch(JSON.stringify(corpus), /@|email-src/i);

	const normalise = eventNormalise(evenement);
	assert.equal(normalise.sourceId, CERTFR_MISP_SOURCE_ID);
	assert.equal(normalise.evidence.mispUuid, UUID_CLEAR);
	assert.equal(normalise.evidence.tlp, "clear");
	assert.equal(normalise.evidence.indicatorCount, 3);
	assert.equal(normalise.evidence.objectCount, 1);
	assert.equal(normalise.observedAt, "2026-11-10T00:00:00.000Z");
	assert.equal(admitEvent(normalise as unknown as Record<string, unknown>).ok, true);
});

test("collecteur : manifeste et corps lus via le contexte, corpus écrit sans réseau", async () => {
	const ctx: CollectContext = {
		fetchJson: async <T>(url: string) => {
			if (url === CERTFR_MISP_MANIFEST_URL) return manifesteFaux() as T;
			const uuid = url.split("/").pop()?.replace(/\.json$/, "") ?? "";
			return (corpsFaux()[uuid] ?? {}) as T;
		},
		fetchText: async () => { throw new Error("réseau interdit"); },
		cursor: {},
		log: () => {},
		now: () => new Date("2026-11-22T12:00:00Z"),
	};
	const resultat = await collector.run(ctx);
	assert.equal(resultat.events.length, 1);
	assert.equal(resultat.events[0]?.evidence.mispUuid, UUID_CLEAR);
	assert.equal(resultat.cursor?.admitted, 1);
	assert.equal(resultat.cursor?.unreadable, 0);

	const { rows } = await query<{ indicators: Array<{ type: string; value: string }>; context: Record<string, unknown> }>(
		"SELECT indicators, context FROM certfr_misp_event WHERE uuid = $1",
		[UUID_CLEAR],
	);
	assert.equal(rows.length, 1, "le corpus durable reçoit l'événement");
	assert.ok(rows[0]?.indicators.some((i) => i.value === HASH_SHA256), "l'attribut d'objet est dans le corpus");
	const indicateurs = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM indicator WHERE source_id = $1 AND value = $2",
		[CERTFR_MISP_SOURCE_ID, "phishing.example.test"],
	);
	assert.equal(indicateurs.rows[0]?.n, 1, "l'indicateur technique est réutilisable par la détection");
	const personnels = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM indicator WHERE value ILIKE '%@%'",
	);
	assert.equal(personnels.rows[0]?.n, 0, "aucune adresse personnelle n'entre dans indicator");
});

test("corrélation : fenêtre temporelle, UUID MISP en preuve, critère de sortie à 0", async () => {
	const maintenant = new Date("2026-11-22T15:00:00.000Z");
	const { rows: source } = await query<{ id: string; region: string }>(
		"SELECT id, region FROM source WHERE id = $1", [CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(source.length, 1, "la migration 200 enregistre la source");
	assert.equal(source[0]?.region, "national", "la source nationale n'est pas présentée comme locale");

	// Corpus contrôlé : un événement nommant un acteur (recoupement sémantique)
	// et un ensemble ransomware sans valeur commune (rapprochement de catégorie).
	await query("DELETE FROM certfr_misp_event");
	await enregistrerCorpusMisp(corpusDepuisFluxMisp(manifesteFaux(), corpsFaux()));
	await query(
		`INSERT INTO certfr_misp_event (uuid, misp_date, info, org_name, indicators, context, feed_url)
		 VALUES ($1, '2026-11-08', 'Maze ransomware IOCs (OSINT)', 'CERT-FR', $2::jsonb, $3::jsonb, $4)`,
		[UUID_MAZE, JSON.stringify([{ type: "domain", value: "maze-c2.example.test" }]),
		 JSON.stringify({ labels: ["maze"], targetLocations: [], urls: [], attachments: [], comments: [], dates: [] }),
		 `https://misp.cert.ssi.gouv.fr/feed-misp/${UUID_MAZE}.json`],
	);
	// Le corpus durable garde aussi un fait ancien : il ne doit plus fonder
	// une corrélation actuelle. Les deux faits utiles sont datés de la fenêtre.
	await query("UPDATE certfr_misp_event SET misp_date='2026-11-22' WHERE uuid=$1", [UUID_CLEAR]);
	await query("UPDATE certfr_misp_event SET misp_date='2026-11-19' WHERE uuid=$1", [UUID_MAZE]);

	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, domain, status)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', $3, 'confirme') RETURNING id`,
		[`Org MISP ${TAG}`, `org-${TAG}`, `${TAG}.example.test`],
	);
	const orgId = org.rows[0]?.id;
	assert.ok(orgId, "organisation régionale créée");
	const semantique = await query<{ id: string }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id,
		                    evidence, regional, regional_motif, org_id, source_url)
		 VALUES ($1, 'ransomware', 'third_party_claim', $2, '2026-11-22T00:00:00Z', 'ransomlook',
		         '{"feed":"test"}'::jsonb || '{"run_id":"1"}'::jsonb, true, 'rattachement', $3, 'https://example.invalid/event')
		 RETURNING id::text AS id`,
		[`regional-${TAG}-a`, `Revendication Sandworm ${TAG} en Gironde`, orgId],
	);
	const contexte = await query<{ id: string }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id,
		                    evidence, regional, regional_motif, org_id, source_url)
		 VALUES ($1, 'ransomware', 'third_party_claim', $2, '2026-11-19T00:00:00Z', 'ransomlook',
		         '{"feed":"test"}'::jsonb || '{"run_id":"1"}'::jsonb, true, 'rattachement', $3, 'https://example.invalid/event')
		 RETURNING id::text AS id`,
		[`regional-${TAG}-b`, `Revendication ransomware ${TAG} en Gironde`, orgId],
	);
	assert.ok(semantique.rows[0]?.id && contexte.rows[0]?.id);

	const resultat = await correlaterIndicateursCertfrMisp({ days: 7, now: maintenant });
	assert.equal(resultat.evenements, 6, "seuls les jours avec recoupement réel écrivent un événement");
	assert.deepEqual(resultat.jours, [
		"2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
		"2026-11-20", "2026-11-21", "2026-11-22",
	]);
	assert.ok(resultat.bases.semantique >= 1, "un acteur commun fonde au moins un recoupement sémantique");
	assert.ok(resultat.bases.categorie >= 1, "une catégorie commune fonde un rapprochement proche dans le temps");
	assert.equal(resultat.bases["contexte-du-jour"], 1, "le jour sans fait dans la fenêtre n'est que journalisé");
	assert.equal(
		resultat.bases.semantique + resultat.bases.categorie + resultat.bases["contexte-du-jour"], 7,
	);

	// Critère de sortie, exécuté tel quel.
	const fraicheur = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM source WHERE id = $1
		  AND (last_ok_at IS NULL OR last_ok_at < now() - interval '48 hours')`,
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(fraicheur.rows[0]?.n, 0, "source certfr_misp fraîche");

	const quotidien = await query<{ n: number; jours: number; premier: string; dernier: string; sans_uuid: number }>(
		`SELECT count(*)::int AS n,
		        count(DISTINCT date(observed_at))::int AS jours,
		        min(date(observed_at))::text AS premier,
		        max(date(observed_at))::text AS dernier,
		        count(*) FILTER (WHERE evidence ->> 'mispUuid' IS NULL)::int AS sans_uuid
		   FROM event
		  WHERE source_id = $1 AND assertion_type = 'suggested_relation'
		    AND dedup_key LIKE 'certfr-misp-correlation:%'`,
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.deepEqual(quotidien.rows[0], { n: 6, jours: 6, premier: "2026-11-17", dernier: "2026-11-22", sans_uuid: 0 });

	const bases = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM event
		  WHERE source_id = $1 AND dedup_key LIKE 'certfr-misp-correlation:%'
		    AND evidence ? 'correlationBasis'`,
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(bases.rows[0]?.n, 6, "chaque corrélation écrite dit sur quoi elle repose");

	const relations = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM relation r
		   JOIN event e ON e.id::text = r.dst_id
		  WHERE e.source_id = $1 AND r.relation_type = 'correlated_with'`,
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(relations.rows[0]?.n, 6, "chaque corrélation est reliée à l'événement régional");

	const rejeu = await correlaterIndicateursCertfrMisp({ days: 7, now: maintenant });
	assert.equal(rejeu.evenements, 0, "un rejeu n'écrit rien");
	assert.equal(rejeu.relations, 0, "un rejeu ne duplique aucune relation");
	const apresRejeu = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM event
		  WHERE source_id = $1 AND dedup_key LIKE 'certfr-misp-correlation:%'`,
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(apresRejeu.rows[0]?.n, 6);

	// La corrélation ne tient pas la source pour fraîche : seule l'ingestion le
	// fait. Sinon un flux arrêté resterait « sain » grâce aux jours rejoués.
	await query(
		"UPDATE source SET last_ok_at = now() - interval '10 days' WHERE id = $1",
		[CERTFR_MISP_SOURCE_ID],
	);
	await correlaterIndicateursCertfrMisp({ days: 1, now: new Date("2026-11-23T15:00:00.000Z") });
	const sante = await query<{ perime: boolean }>(
		"SELECT last_ok_at < now() - interval '48 hours' AS perime FROM source WHERE id = $1",
		[CERTFR_MISP_SOURCE_ID],
	);
	assert.equal(sante.rows[0]?.perime, true, "une corrélation ne masque pas un flux arrêté");
});

after(async () => {
	await query(
		`DELETE FROM relation WHERE evidence ->> 'mispUuid' = ANY($1::text[])`,
		[[UUID_CLEAR, UUID_MAZE]],
	).catch(() => {});
	await supprimerEvenementsArchivees("source_id = $1 AND dedup_key LIKE 'certfr-misp-correlation:%'", [CERTFR_MISP_SOURCE_ID]).catch(() => {});
	await supprimerEvenementsArchivees("dedup_key LIKE $1", [`regional-${TAG}%`]).catch(() => {});
	await query("DELETE FROM org WHERE slug = $1", [`org-${TAG}`]).catch(() => {});
	await query("DELETE FROM certfr_misp_event").catch(() => {});
	await query("DELETE FROM indicator WHERE source_id = $1", [CERTFR_MISP_SOURCE_ID]).catch(() => {});
	await query("DELETE FROM collector_run WHERE source_id = $1", [CERTFR_MISP_SOURCE_ID]).catch(() => {});
	await closePools();
});
