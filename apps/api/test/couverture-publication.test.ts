/**
 * Porte de publication de la mesure de couverture.
 *
 * Un corpus de 5 lignes doit être refusé avec une raison chiffrée ; un corpus
 * de 50 lignes, réparti sur plus de 90 jours et couvert par au moins cinq
 * éditeurs, doit être publié. La mesure est rejouée sur un SQL factice : ni
 * base, ni réseau, ni écriture de rapport.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
	mesurerCouverture,
	SQL_COLLECTE,
	SQL_EVENEMENTS,
	SQL_ETAT_BASE,
	SQL_FILTRE,
	SQL_SECTEURS,
	type CorpusConsolide,
	type ExecuteurSQL,
} from "../src/analyse/couverture-base.js";
import type { IncidentCorpus } from "../src/analyse/corpus-couverture.js";

const SECTEURS = {
	agroalimentaire: 11_209,
	industrie: 48_895,
	construction: 115_581,
	commerce: 175_250,
};

/** Les dates couvrent 180 jours ; cinq éditeurs se partagent les lignes. */
function corpus(lignes: number, jours = 180): CorpusConsolide {
	const incidents: IncidentCorpus[] = Array.from({ length: lignes }, (_, i) => {
		const decalage = lignes === 1 ? 0 : Math.floor((i * (jours - 1)) / (lignes - 1));
		const date = new Date(Date.UTC(2026, 0, 1) + decalage * 86_400_000)
			.toISOString()
			.slice(0, 10);
		return {
			id: `synth-${String(i + 1).padStart(3, "0")}`,
			date_publication: date,
			date_incident: null,
			organisation: `Organisation ${i + 1}`,
			departement: "Gironde",
			type: "ransomware",
			source: `Éditeur ${(i % 5) + 1}`,
			titre: `Incident ${i + 1}`,
			url: `https://exemple.fr/incident-${i + 1}`,
			extrait: null,
			resume: null,
			confiance: null,
			verifie_le: null,
		};
	});
	const canonique = `${incidents.map((i) => JSON.stringify(i)).join("\n")}\n`;
	return {
		incidents,
		canonique,
		sha256: createHash("sha256").update(canonique, "utf8").digest("hex"),
		fichiers: ["incidents.jsonl"],
		doublons: [],
	};
}

/** SQL factice : état de base, secteurs présents, aucune preuve d'événement. */
const sql: ExecuteurSQL = <T>(texte: string): Promise<{ rows: T[] }> => {
	if (texte === SQL_ETAT_BASE) {
		return Promise.resolve({
			rows: [
				{
					derniere_collecte: "2026-06-30",
					derniere_execution: "2026-06-30",
					evenements: 1_000,
					evenements_archives: 100,
					sources: 20,
					organisations: "1000",
				},
			] as T[],
		});
	}
	if (texte === SQL_SECTEURS) {
		return Promise.resolve({
			rows: Object.entries(SECTEURS).map(([secteur, n]) => ({ secteur, n: String(n) })) as T[],
		});
	}
	if (texte === SQL_EVENEMENTS || texte === SQL_COLLECTE || texte === SQL_FILTRE) {
		return Promise.resolve({ rows: [] as T[] });
	}
	return Promise.reject(new Error(`requête SQL inattendue : ${texte}`));
};

test("mesure sur 5 lignes : publication refusée avec une raison chiffrée", async () => {
	const rapport = await mesurerCouverture({ corpus: corpus(5), query: sql });
	assert.equal(rapport.global.total, 5);
	assert.equal(rapport.publication.publiable, false);
	assert.equal(rapport.publication.mention, "refus de publication");
	assert.deepEqual(
		rapport.publication.refus.map((r) => r.code),
		["corpus_trop_petit"],
	);
	assert.match(rapport.publication.raison ?? "", /Corpus trop petit : 5 incident\(s\)/);
	assert.match(rapport.publication.raison ?? "", /seuil minimal 30/);
	assert.equal(rapport.publication.corpus.dansFenetre, 5);
});

test("mesure sur 50 lignes : publication autorisée", async () => {
	const rapport = await mesurerCouverture({ corpus: corpus(50), query: sql });
	assert.equal(rapport.global.total, 50);
	assert.equal(rapport.publication.publiable, true);
	assert.equal(rapport.publication.mention, null);
	assert.equal(rapport.publication.raison, null);
	assert.deepEqual(rapport.publication.refus, []);
	assert.equal(rapport.publication.corpus.jours, 180);
	assert.equal(rapport.publication.sources.distinctes, 5);
	assert.equal(rapport.publication.referentiel.partSecteurs, 1);
});

test("mesure sur 50 lignes en 30 jours : fenêtre trop courte", async () => {
	const rapport = await mesurerCouverture({ corpus: corpus(50, 30), query: sql });
	assert.equal(rapport.publication.publiable, false);
	assert.deepEqual(
		rapport.publication.refus.map((r) => r.code),
		["fenetre_courte"],
	);
	assert.match(rapport.publication.raison ?? "", /Fenêtre trop courte : 30 jour\(s\)/);
});

test("corpus vide : refus explicite sans lever d'exception", async () => {
	const rapport = await mesurerCouverture({
		corpus: { incidents: [], canonique: "", sha256: "vide", fichiers: [], doublons: [] },
		query: sql,
	});
	assert.equal(rapport.global.total, 0);
	assert.equal(rapport.publication.publiable, false);
	assert.equal(rapport.publication.corpus.jours, 0);
	assert.deepEqual(
		rapport.publication.refus.map((r) => r.code),
		["corpus_trop_petit", "sources_trop_peu_productives", "fenetre_courte"],
	);
	assert.match(rapport.publication.raison ?? "", /Corpus trop petit : 0 incident\(s\) dans aucune date de publication/);
	assert.match(rapport.publication.raison ?? "", /aucune fenêtre mesurable/);
});
