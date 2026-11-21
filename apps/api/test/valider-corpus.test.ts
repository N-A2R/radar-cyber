/**
 * Un test par comportement du validateur unique du corpus. Les chargements
 * réseau sont injectés : aucun test ne dépend d'un site tiers ni du corpus
 * versionné (excepté la liste des fichiers, lue dans un dossier temporaire).
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	OPTIONS_DEFAUT,
	confirmerEchecs,
	classer,
	creerChargeurHttp,
	construireRapport,
	enConcurrence,
	extraireUrl,
	jetonsAttendus,
	lireFichier,
	listerCorpus,
	rendreTableau,
	validerEntree,
	type Chargeur,
	type Entree,
	type Reponse,
} from "../../../scripts/valider-corpus.mjs";

const options = { ...OPTIONS_DEFAUT, lecteur: null };

function reponse(partie: Partial<Reponse>): Reponse {
	const corps = partie.corps ?? "";
	return {
		statut: 200,
		urlFinale: "https://exemple.fr/final",
		corps,
		octets: partie.octets ?? Buffer.byteLength(corps),
		typeContenu: partie.typeContenu ?? "text/html; charset=utf-8",
		erreur: null,
		bloquee: false,
		...partie,
	};
}

function entree(partie: Partial<Entree> = {}): Entree {
	return {
		fichier: "sources-test.jsonl",
		ligne: 1,
		id: "test-001",
		nom: "Ville de Floirac",
		url: "https://exemple.fr/article",
		attendus: jetonsAttendus("Ville de Floirac"),
		...partie,
	};
}

describe("validateur unique du corpus", () => {
	it("découvre tous les fichiers .jsonl du dossier, y compris masqués", () => {
		const dir = mkdtempSync(join(tmpdir(), "valider-corpus-"));
		try {
			for (const f of ["a.jsonl", ".research-b.jsonl", "c.json", "d.jsonl.bak"]) {
				writeFileSync(join(dir, f), "{}\n", "utf8");
			}
			assert.deepEqual(listerCorpus(dir), [".research-b.jsonl", "a.jsonl"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("extrait l'URL des quatre formes de corpus et ignore les accès non HTTP", () => {
		const cas: Array<[Record<string, unknown>, string | null]> = [
			[{ url: "https://exemple.fr/a" }, "https://exemple.fr/a"],
			[{ url_flux: "https://exemple.fr/feed.xml" }, "https://exemple.fr/feed.xml"],
			[{ acces: "https://crt.sh/?q=a&output=atom" }, "https://crt.sh/?q=a&output=atom"],
			[{ url: "https://exemple.fr/", preuve: { url_finale: "https://exemple.fr/final" } }, "https://exemple.fr/"],
			[{ acces: "bench/corpus/ransomware-na.jsonl (fichier local)" }, null],
			[{ acces: "non utilisé" }, null],
		];
		for (const [objet, attendu] of cas) assert.equal(extraireUrl(objet), attendu);
	});

	it("lit chaque ligne JSONL et nomme les entrées sans URL", () => {
		const dir = mkdtempSync(join(tmpdir(), "valider-corpus-"));
		try {
			const fichier = "sources-test.jsonl";
			writeFileSync(join(dir, fichier), [
				JSON.stringify({ id: "a", nom: "Sud Ouest", url: "https://sudouest.fr/" }),
				"",
				JSON.stringify({ id: "b", source: "CERT-FR", url_flux: "https://cert.fr/feed/" }),
				JSON.stringify({ id: "c", source: "EXCLU", acces: "non utilisé" }),
			].join("\n"), "utf8");
			const entrees = lireFichier(dir, fichier);
			assert.deepEqual(entrees.map((e) => [e.ligne, e.id, e.url]), [
				[1, "a", "https://sudouest.fr/"],
				[3, "b", "https://cert.fr/feed/"],
				[4, "c", null],
			]);
			assert.deepEqual(entrees[1]!.attendus, ["cert"]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("classe valide quand un jeton du nom apparaît malgré accents et balises", () => {
		const r = classer(entree(), reponse({
			corps: `<html><script>var x='Floirac';</script><body><h1>La ville de&nbsp;Floirac attaquée</h1>
			<p>Les services municipaux sont indisponibles depuis ce matin dans la commune.</p></body></html>`,
		}), options, 1, null, 12);
		assert.equal(r.categorie, "valide");
		assert.deepEqual(r.trouves, ["floirac"]);
	});

	it("classe incohérente quand une page exploitable ne mentionne pas l'entité", () => {
		const r = classer(entree(), reponse({
			corps: "<html><body><p>Une tout autre commune, très éloignée, est concernée par un incident cette semaine.</p></body></html>",
		}), options, 1, null, 12);
		assert.equal(r.categorie, "incoherent");
		assert.deepEqual(r.trouves, []);
	});

	it("classe sans contenu une page vide et un flux sans item", () => {
		const vide = classer(entree(), reponse({ corps: "<html><body></body></html>", octets: 40 }), options, 1, null, 5);
		assert.equal(vide.categorie, "sans contenu");
		const flux = classer(entree(), reponse({
			corps: '<?xml version="1.0"?><rss version="2.0"><channel><title>Vide</title></channel></rss>',
			typeContenu: "application/rss+xml",
		}), options, 1, null, 5);
		assert.equal(flux.categorie, "sans contenu");
		assert.equal(flux.erreur, "flux sans item");
	});

	it("classe morte une erreur réseau ou un statut HTTP >= 400", () => {
		const reseau = classer(entree(), reponse({ statut: 0, erreur: "fetch failed" }), options, 2, null, 100);
		assert.equal(reseau.categorie, "morte");
		const http = classer(entree(), reponse({ statut: 404 }), options, 1, null, 20);
		assert.equal(http.categorie, "morte");
		assert.equal(http.erreur, "HTTP 404");
	});

	it("réessaie une erreur transitoire puis s'arrête au premier succès", async () => {
		let appels = 0;
		const chargeur: Chargeur = async () => {
			appels++;
			if (appels === 1) throw new Error("ECONNRESET");
			return reponse({ corps: "<html><body>La ville de Floirac est touchée par un incident.</body></html>" });
		};
		const r = await validerEntree(entree(), { ...options, tentatives: 3 }, chargeur);
		assert.equal(appels, 2);
		assert.equal(r.tentatives, 2);
		assert.equal(r.categorie, "valide");
	});

	it("confirme un échec avant publication et ne garde qu'un succès reproductible", async () => {
		let appels = 0;
		const fluctuant: Chargeur = async () => {
			appels++;
			if (appels < 3) throw new Error("ECONNRESET");
			return reponse({ corps: "<p>La ville de Floirac est touchée par un incident.</p>" });
		};
		const e = entree();
		const optionsCourtes = { ...options, tentatives: 1 };
		const initial = await validerEntree(e, optionsCourtes, fluctuant);
		assert.equal(initial.categorie, "morte");
		const [confirme] = await confirmerEchecs(
			[{ index: 0, entree: e, resultat: initial }], optionsCourtes, fluctuant,
		);
		assert.equal(confirme!.resultat.categorie, "valide");
		const toujoursMort: Chargeur = async () => { throw new Error("indisponible"); };
		const [gardee] = await confirmerEchecs(
			[{ index: 1, entree: e, resultat: initial }], optionsCourtes, toujoursMort,
		);
		assert.equal(gardee!.index, 1);
		assert.equal(gardee!.resultat.categorie, "morte");
	});

	it("replit vers le lecteur quand le site bloque", async () => {
		const chargeur: Chargeur = async () => reponse({
			statut: 403, bloquee: true, corps: "Access Denied", octets: 13,
		});
		const fetchInitial = globalThis.fetch;
		const urls: string[] = [];
		globalThis.fetch = async (input) => {
			urls.push(String(input));
			return new Response("Title: Floirac\n\nLa ville de Floirac est touchée.", { status: 200 });
		};
		try {
			const r = await validerEntree(entree(), { ...options, lecteur: "https://lecteur.test/" }, chargeur);
			assert.equal(r.categorie, "valide");
			assert.equal(r.lecteur, "https://lecteur.test/");
			assert.deepEqual(urls, ["https://lecteur.test/https://exemple.fr/article"]);
		} finally {
			globalThis.fetch = fetchInitial;
		}
	});

	it("ne replie pas vers le lecteur pour un captcha caché dans un script", async () => {
		const fetchInitial = globalThis.fetch;
		let appels = 0;
		globalThis.fetch = async () => {
			appels++;
			return new Response(
				`<html><script>recaptcha init captcha widget</script><body><p>${"texte utile de la page ".repeat(20)}</p></body></html>`,
				{ status: 200, headers: { "content-type": "text/html" } },
			);
		};
		try {
			const rep = await creerChargeurHttp(options)(
				"https://exemple.fr/", new AbortController().signal,
			);
			assert.equal(rep.bloquee, false);
			assert.equal(appels, 1);
		} finally {
			globalThis.fetch = fetchInitial;
		}
	});
	it("borne la concurrence sans perdre ni réordonner les résultats", async () => {
		let enVol = 0;
		let maxEnVol = 0;
		let libererTous = false;
		const liberes: Array<() => void> = [];
		const troisDemarres = Promise.withResolvers<void>();
		const enCours = enConcurrence([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
			enVol++;
			maxEnVol = Math.max(maxEnVol, enVol);
			const porte = Promise.withResolvers<void>();
			liberes.push(porte.resolve);
			if (liberes.length === 3) troisDemarres.resolve();
			if (libererTous) porte.resolve();
			await porte.promise;
			enVol--;
			return n * 10;
		});
		await troisDemarres.promise;
		assert.equal(maxEnVol, 3);
		libererTous = true;
		for (const liberer of liberes) liberer();
		assert.deepEqual(await enCours, [10, 20, 30, 40, 50, 60, 70]);
	});

	it("calcule le taux par fichier et affiche le tableau complet", () => {
		const entrees = [
			entree({ fichier: "a.jsonl", ligne: 1 }),
			entree({ fichier: "a.jsonl", ligne: 2, url: null }),
			entree({ fichier: "b.jsonl", ligne: 1 }),
		];
		const resultats = [
			classer(entrees[0]!, reponse({ corps: "<p>La ville de Floirac va mieux.</p>" }), options, 1, null, 1),
			classer(entrees[2]!, reponse({ corps: "<p>Aucun rapport avec cette commune.</p>" }), options, 1, null, 1),
		];
		resultats[1] = { ...resultats[1]!, lecteur: "https://lecteur.test/" };
		const rapport = construireRapport("bench/corpus", ["a.jsonl", "b.jsonl"], entrees, resultats, options, Date.now());
		assert.deepEqual(rapport.parFichier.map((l) => [l.fichier, l.lignes, l.urls, l.valide, l.morte, l["sans contenu"], l.incoherent, l.sansUrl, l.lecteur, l.taux]), [
			["a.jsonl", 2, 1, 1, 0, 0, 0, 1, 0, 100],
			["b.jsonl", 1, 1, 0, 0, 0, 1, 0, 1, 0],
		]);
		assert.equal(rapport.totaux.taux, 50);
		const tableau = rendreTableau(rapport);
		assert.match(tableau, /a\.jsonl/);
		assert.match(tableau, /b\.jsonl/);
		assert.match(tableau, /TOTAL \(2 fichiers\)/);
		assert.match(tableau, /50\.0 %/);
	});
});
