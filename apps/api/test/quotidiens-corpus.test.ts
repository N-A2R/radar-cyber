/**
 * Contrats du corpus des quotidiens régionaux : chaque ligne doit porter sa
 * preuve de chargement, une fréquence mesurée sur les pubDate du flux, un
 * exemple récent vérifié, et — quand le scraping est bloqué — la parade
 * effectivement employée. Aucun appel réseau ici : le corpus est figé au
 * 21/11/2026 par les champs de preuve.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

type PreuveChargement = {
	flux_http: number;
	flux_octets: number;
	flux_titre: string;
	accueil_http: number;
	accueil_octets: number;
	accueil_titre: string;
	xml_items: number;
	verifie_le: string;
};

type Quotidien = {
	id: string;
	nom: string;
	url_flux: string;
	flux_http: number;
	url_site: string;
	items: number;
	frequence: string;
	frequence_precision: string;
	exemple_titre_recent: string;
	exemple_date: string;
	exemple_url: string;
	blocage: string;
	parade: string;
	preuve_chargement: PreuveChargement;
};

const corpus = fileURLToPath(new URL("../../../bench/corpus/quotidiens.jsonl", import.meta.url));
const quotidiens = readFileSync(corpus, "utf8")
	.trim()
	.split("\n")
	.map((ligne) => JSON.parse(ligne) as Quotidien);

describe("corpus des quotidiens régionaux", () => {
	it("au moins huit flux, chacun avec une preuve de chargement HTTP datée", () => {
		assert.ok(quotidiens.length >= 8);
		for (const q of quotidiens) {
			const p = q.preuve_chargement;
			assert.equal(p.flux_http, 200, q.id);
			assert.ok(p.flux_octets > 0, q.id);
			assert.ok(p.flux_titre.length > 0, q.id);
			assert.equal(p.verifie_le, "2026-11-21", q.id);
			assert.equal(q.flux_http, p.flux_http, q.id);
			assert.equal(q.items, p.xml_items, q.id);
		}
	});

	it("la fréquence de chaque flux est mesurée sur ses pubDate, pas supposée", () => {
		const classes: Record<string, true> = {
			continue: true,
			"multi-quotidienne": true,
			quotidienne: true,
			"irrégulière": true,
		};
		const mesure = /^\d+ items datés sur [\d,.]+ h ; écart médian [\d,.]+ h ; [\d,.]+ items\/j \(pubDate du flux, GET 21\/11\/2026\)$/;
		for (const q of quotidiens) {
			assert.ok(classes[q.frequence], q.id);
			assert.match(q.frequence_precision, mesure, q.id);
		}
	});

	it("chaque exemple de titre est daté et son URL appartient au flux vérifié", () => {
		for (const q of quotidiens) {
			assert.ok(q.exemple_titre_recent.length > 10, q.id);
			assert.ok(Number.isFinite(Date.parse(q.exemple_date)), q.id);
			const titreHost = new URL(q.exemple_url).hostname;
			const siteHost = new URL(q.url_site).hostname;
			const fluxHost = new URL(q.url_flux).hostname;
			assert.ok(
				titreHost === siteHost || (fluxHost === "news.google.com" && titreHost === fluxHost),
				`${q.id} : ${titreHost} n'appartient ni au site ni au flux`
			);
		}
	});

	it("la page d'accueil de chaque quotidien a été chargée en HTTP 200 avec un titre", () => {
		for (const q of quotidiens) {
			assert.equal(q.preuve_chargement.accueil_http, 200, q.id);
			assert.ok(q.preuve_chargement.accueil_octets > 0, q.id);
			assert.ok(q.preuve_chargement.accueil_titre.length > 0, q.id);
		}
	});

	it("les titres sans RSS éditeur documentent le 404 et la parade Google News", () => {
		const viaGoogle = quotidiens.filter((q) => q.nom.includes("via Google News"));
		assert.equal(viaGoogle.length, 2);
		for (const q of viaGoogle) {
			assert.equal(new URL(q.url_flux).hostname, "news.google.com", q.id);
			assert.match(q.blocage, /404/, q.id);
			assert.match(q.blocage, /atterrissage/, q.id);
			assert.ok(q.parade.includes(q.url_flux), q.id);
		}
	});

	it("les flux éditeur payants déclarent l'usage des seules métadonnées RSS", () => {
		const directs = quotidiens.filter((q) => !q.nom.includes("via Google News"));
		assert.equal(directs.length, 15);
		for (const q of directs) {
			assert.match(q.blocage, /paywall/, q.id);
			assert.match(q.parade, /Métadonnées RSS seules/, q.id);
		}
	});
});
