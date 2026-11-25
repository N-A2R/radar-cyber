import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { closePools, query } from "../src/db.js";
import {
	ancrerJour,
	ancrerJournalDuJour,
	bornesDeLignes,
	jourHier,
	lignesDuJour as lignesJournalDuJour,
	verifierJour,
} from "../src/journal/anchor.js";
import { feuilleJournal, racineJournal, racineMerkle, type LigneJournal } from "../src/journal/merkle.js";
import { empreinteRacine, requeteTimestamp, verifierJeton, type JetonObtenu, type JetonVerifie } from "../src/journal/rfc3161.js";

/** Jour de la décision historique qu'on veut pouvoir prouver après correction. */
const JOUR = "2026-11-03";
const MARQUE = `test-anchor-${Date.now()}`;
let dossier: string;

before(async () => {
	dossier = await mkdtemp(join(tmpdir(), "radar-anchor-"));
});

after(async () => {
	await rm(dossier, { recursive: true, force: true });
	await closePools().catch(() => {});
});

/** La TSA est injectée : les tests ne dépendent jamais du réseau. */
const fournisseurTest = async (racine: string): Promise<JetonObtenu> => ({
	jeton: Buffer.from(`jeton-test-${racine}`).toString("base64"),
	certificat: Buffer.from("certificat-test").toString("base64"),
	tsaUrl: "https://tsa.test.invalid/tsr",
	genTime: "2026-11-04T00:01:02Z",
	serial: "01",
	nonce: null,
});
const verificateurTest = (jeton: string): JetonVerifie => {
	assert.ok(jeton.length > 0, "un jeton doit être présent");
	return { genTime: "2026-11-04T00:01:02Z", serial: "01", nonce: null, certificat: "certificat-test" };
};

async function insérerFait(options: {
	subject: string;
	summary: string;
	recordedAt: string;
	validAt: string | null;
	payload?: Record<string, unknown>;
}): Promise<number> {
	const resultat = await query<{ id: string }>(
		`INSERT INTO journal (kind, subject, summary, payload, actor, valid_at, recorded_at)
		 VALUES ('revue.decided', $1, $2, $3::jsonb, 'humain:test', $4, $5::timestamptz)
		 RETURNING id::text AS id`,
		[
			options.subject,
			options.summary,
			JSON.stringify(options.payload ?? {}),
			options.validAt,
			options.recordedAt,
		],
	);
	return Number(resultat.rows[0]?.id);
}

async function lignesDuJour(): Promise<LigneJournal[]> {
	const resultat = await query<any>(
		`SELECT id::text AS id, kind, subject, summary, payload, actor, valid_at, recorded_at
		   FROM journal
		  WHERE (recorded_at AT TIME ZONE 'UTC')::date = $1::date
		  ORDER BY id`,
		[JOUR],
	);
	return resultat.rows.map((ligne) => ({ ...ligne, id: Number(ligne.id) }));
}

describe("ancrage quotidien du journal de vérité", () => {
	it("ancre une décision rétroactive le jour où elle a été connue", async () => {
		const id = await insérerFait({
			subject: `${MARQUE}-decision`,
			summary: "décision du 3 novembre déjà prise ce jour-là",
			recordedAt: `${JOUR}T09:30:00Z`,
			validAt: "2026-11-03T08:00:00Z",
			payload: { decision: "publier", version: 1 },
		});
		assert.ok(id > 0);
		const lignes = await lignesDuJour();
		assert.equal(lignes.length, 1);
		assert.equal(new Date(lignes[0]?.valid_at ?? 0).toISOString().slice(0, 10), "2026-11-03");
	});

	it("la racine est recomputable et indépendante de l'ordre des clés JSON", async () => {
		const lignes = await lignesDuJour();
		assert.equal(lignes.length, 1);
		const premiere = racineJournal(lignes);
		assert.match(premiere, /^[0-9a-f]{64}$/);
		await insérerFait({
			subject: `${MARQUE}-seconde`,
			summary: "seconde décision du même jour",
			recordedAt: `${JOUR}T14:00:00Z`,
			validAt: null,
			payload: { version: 2, decision: "publier" },
		});
		const deuxLignes = await lignesDuJour();
		assert.equal(deuxLignes.length, 2);
		assert.notEqual(racineJournal(deuxLignes), premiere);
		const uneLigne = deuxLignes[0]!;
		assert.equal(
			racineJournal([{ ...uneLigne, payload: { a: 1, b: 2 } }]),
			racineJournal([{ ...uneLigne, payload: { b: 2, a: 1 } }]),
		);
	});

	it("publie un fichier daté, la racine, le jeton et les bornes en base", async () => {
		const resultat = await ancrerJour({
			jour: JOUR,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.equal(resultat.statut, "cree");
		assert.equal(resultat.ancrage.token_rfc3161.length > 0, true);
		assert.equal(resultat.ancrage.certificat_tsa.length > 0, true);
		assert.equal(resultat.ancrage.racine_sha256, racineJournal(await lignesDuJour()));
		assert.ok(Number(resultat.ancrage.journal_debut_id) > 0);
		assert.ok(Number(resultat.ancrage.journal_fin_id) >= Number(resultat.ancrage.journal_debut_id));
		const extremes = await query<{ debut: string; fin: string }>(
			`SELECT min(id)::text AS debut, max(id)::text AS fin FROM journal
			  WHERE (recorded_at AT TIME ZONE 'UTC')::date = $1::date`,
			[JOUR],
		);
		assert.equal(resultat.ancrage.journal_debut_id, extremes.rows[0]?.debut, "borne basse = min numérique");
		assert.equal(resultat.ancrage.journal_fin_id, extremes.rows[0]?.fin, "borne haute = max numérique");

		const publie = JSON.parse(await readFile(join(dossier, `journal_root_${JOUR}.json`), "utf8"));
		assert.equal(publie.schema, "radar.journal.root/v1");
		assert.equal(publie.jour, JOUR);
		assert.equal(publie.racine_sha256, resultat.ancrage.racine_sha256);
		assert.equal(publie.token_rfc3161, resultat.ancrage.token_rfc3161);

		const verification = await verifierJour({ jour: JOUR, dossier, verificateur: verificateurTest });
		assert.equal(verification.ok, true);
		assert.equal(verification.lignes, 2);
	});

	it("rejoue sans rien changer et refuse toute réécriture de l'ancrage", async () => {
		const avant = JSON.parse(await readFile(join(dossier, `journal_root_${JOUR}.json`), "utf8"));
		const rejeu = await ancrerJour({
			jour: JOUR,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.equal(rejeu.statut, "existant");
		assert.equal(rejeu.ancrage.racine_sha256, avant.racine_sha256);
		const apres = JSON.parse(await readFile(join(dossier, `journal_root_${JOUR}.json`), "utf8"));
		assert.deepEqual(apres, avant);
		await assert.rejects(
			() => query("UPDATE journal_anchor SET racine_sha256 = racine_sha256 WHERE jour = $1", [JOUR]),
			/immuable/,
		);
	});

	it("survit à une correction de projection datée plus tard", async () => {
		await insérerFait({
			subject: `${MARQUE}-decision`,
			summary: "projection corrigée après coup",
			recordedAt: "2026-11-04T10:00:00Z",
			validAt: "2026-11-03T08:00:00Z",
			payload: { decision: "publier", version: 2 },
		});
		const verification = await verifierJour({ jour: JOUR, dossier, verificateur: verificateurTest });
		assert.equal(verification.ok, true);
		assert.equal(verification.lignes, 2, "les bornes d'id excluent la correction postérieure");
	});

	it("remplit le critère SQL pour la veille, avec une ligne réellement présente", async () => {
		const hier = await jourHier();
		await ancrerJour({
			jour: hier,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		const critere = await query<{ count: string }>(
			`SELECT count(*) FROM journal_anchor WHERE jour=$1::date AND (racine_sha256 IS NULL OR token_rfc3161 IS NULL OR journal_debut_id IS NULL OR journal_fin_id IS NULL);`,
			[hier],
		);
		assert.equal(Number(critere.rows[0]?.count), 0);
		const present = await query<{ count: string }>("SELECT count(*) FROM journal_anchor WHERE jour=$1::date", [hier]);
		assert.equal(Number(present.rows[0]?.count), 1, "le zéro du critère ne doit pas être vacuous");
	});

	it("reste ancré sur l'arbre vide d'un jour nu malgré une ligne rétroactive", async () => {
		const jour = "2025-01-02";
		const premier = await ancrerJour({
			jour,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.equal(premier.statut, "cree");
		assert.equal(premier.ancrage.journal_debut_id, "0");
		assert.equal(premier.ancrage.journal_fin_id, "0");
		assert.equal(premier.ancrage.journal_lignes, "0");

		// Un fait inscrit après coup, daté de ce jour-là : il est hors bornes.
		await insérerFait({
			subject: `${MARQUE}-retro`,
			summary: "fait inscrit après l'ancrage d'un jour vide",
			recordedAt: `${jour}T12:00:00Z`,
			validAt: `${jour}T11:00:00Z`,
		});
		const rejeu = await ancrerJour({
			jour,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.equal(rejeu.statut, "existant");
		assert.equal(rejeu.ancrage.journal_lignes, "0");
		const verification = await verifierJour({ jour, dossier, verificateur: verificateurTest });
		assert.equal(verification.lignes, 0);
	});

	it("calcule des bornes ordonnées même quand les id changent de largeur", () => {
		const ligne = (id: number): LigneJournal => ({
			id,
			kind: "revue.decided",
			subject: `s-${id}`,
			summary: "m",
			payload: {},
			actor: "humain:test",
			valid_at: null,
			recorded_at: "2026-11-20T12:00:00Z",
		});
		// Le défaut d'origine : un tri lexicographique rend 100000 avant 99999,
		// donc `lignes[0]` > `lignes.at(-1)` et la contrainte refuse la ligne.
		const lexicographique = [ligne(100000), ligne(125802), ligne(99999), ligne(96302)];
		assert.deepEqual(bornesDeLignes(lexicographique), { debut: 96302, fin: 125802 });
		assert.deepEqual(bornesDeLignes([]), { debut: 0, fin: 0 });
	});

	it("relit les lignes d'un jour par id numérique croissant, jamais lexicographique", async () => {
		// Jour futur : hors de `joursManquants` (borné à la veille) et de tout
		// autre test. La base de test est jetable ; la ligne reste en place.
		const jour = "2027-01-01";
		// Ids explicites très au-dessus de la séquence : aucun autre test ne peut
		// les croiser, et leur largeur diffère (9 puis 10 chiffres).
		await query(
			`INSERT INTO journal (id, kind, subject, summary, payload, actor, valid_at, recorded_at) VALUES
			   ($1, 'test.ordre', $3, 'ordre numérique', '{}'::jsonb, 'humain:test', NULL, $4::timestamptz),
			   ($2, 'test.ordre', $3, 'ordre numérique', '{}'::jsonb, 'humain:test', NULL, $4::timestamptz)`,
			[1000000000, 999999999, `${MARQUE}-ordre`, `${jour}T12:00:00Z`],
		);
		const lues = await lignesJournalDuJour(jour);
		assert.deepEqual(lues.map((l) => Number(l.id)), [999999999, 1000000000]);
		assert.deepEqual(bornesDeLignes(lues), { debut: 999999999, fin: 1000000000 });
	});

	it("ancre la veille et rattrape un jour récent laissé nu", async () => {
		const jourNu = "2026-11-05";
		await insérerFait({
			subject: `${MARQUE}-nue`,
			summary: "fait d'un jour encore sans ancrage",
			recordedAt: `${jourNu}T08:00:00Z`,
			validAt: null,
		});
		const resultat = await ancrerJournalDuJour({
			rattrapage: 30,
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.deepEqual(resultat.echecs, []);
		const jours = resultat.ancres.map((a) => a.ancrage.jour);
		assert.ok(jours.includes(await jourHier()), "la veille est toujours ancrée");
		const rattrape = resultat.ancres.find((a) => a.ancrage.jour === jourNu);
		assert.ok(rattrape, "le jour nu est rattrapé");
		assert.equal(rattrape.statut, "cree");
		assert.ok(Number(rattrape.ancrage.journal_lignes) > 0);

		const second = await ancrerJournalDuJour({
			fournisseur: fournisseurTest,
			verificateur: verificateurTest,
			dossier,
		});
		assert.deepEqual(second.echecs, []);
		for (const ancre of second.ancres) assert.equal(ancre.statut, "existant");
	});

	it("la feuille et la racine sont recomputables hors de Node (vecteur figé)", () => {
		// Vecteurs calculés avec openssl uniquement : préfixe de domaine + JSON
		// canonique (clés triées, horodatages ISO à millisecondes).
		//   printf '%s' 'radar.journal.feuille/v1'; printf '\0'; printf '%s' '<json>' | sha256
		const l1: LigneJournal = {
			id: 1,
			kind: "revue.decided",
			subject: "s",
			summary: "m",
			payload: { b: 2, a: 1 },
			actor: "humain:test",
			valid_at: "2026-11-03T08:00:00Z",
			recorded_at: "2026-11-03T09:30:00Z",
		};
		const l2: LigneJournal = {
			id: 2,
			kind: "revue.decided",
			subject: "s2",
			summary: "m2",
			payload: {},
			actor: "humain:test",
			valid_at: null,
			recorded_at: "2026-11-03T14:00:00Z",
		};
		assert.equal(feuilleJournal(l1), "429c5faa4b39789659f2dfc570fae4252150b3a63f627c8363c620bc2578fbe0");
		assert.equal(feuilleJournal(l2), "1dff99783db0e21c19e1e53b4961f472466eba4ed5ec7319fb945fc9941fd9c1");
		assert.equal(
			racineMerkle([feuilleJournal(l1), feuilleJournal(l2)]),
			"29fffe2222bff451d503a007c96a3715361e4df3ffcf8ab408dcf1e2c275d20b",
		);
	});

	it("vérifie un vrai jeton RFC 3161 délivré par une TSA", async () => {
		const fixture = JSON.parse(
			await readFile(new URL("./fixtures/jeton-rfc3161.json", import.meta.url), "utf8"),
		) as { racine: string; token: string; source: string };
		const empreinte = empreinteRacine(fixture.racine);
		const verifie = verifierJeton(fixture.token, empreinte);
		assert.match(verifie.genTime, /^20\d\d-\d\d-\d\dT/);
		assert.match(verifie.serial, /^[0-9a-f]+$/);
		assert.ok(verifie.certificat.length > 0);
		assert.throws(() => verifierJeton(fixture.token, Buffer.alloc(32, 0)), /ne couvre pas cette racine/);
		const requete = requeteTimestamp(empreinte);
		assert.equal(requete[0], 0x30, "TimeStampReq est une SEQUENCE DER");
		assert.ok(requete.includes(Buffer.from("608648016503040201", "hex")), "algorithme SHA-256");
	});

it("course d'ancrage : le fichier publié porte le jeton de la ligne gagnante", async () => {
	const jour = "2026-11-20";
	const subject = `test-anchor-concurrent-${Date.now()}`;
	await insérerFait({
		subject,
		summary: "fait d'un jour distinct pour la simulation de course",
		recordedAt: `${jour}T10:00:00Z`,
		validAt: null,
	});
	const jetonA = Buffer.from("jeton-concurrent-a").toString("base64");
	const jetonB = Buffer.from("jeton-concurrent-b").toString("base64");
	const fournisseur = (jeton: string): typeof fournisseurTest => async (racine: string) => ({
		...await fournisseurTest(racine),
		jeton,
	});
	const [a, b] = await Promise.allSettled([
		ancrerJour({ jour, fournisseur: fournisseur(jetonA), verificateur: verificateurTest, dossier }),
		ancrerJour({ jour, fournisseur: fournisseur(jetonB), verificateur: verificateurTest, dossier }),
	]);
	assert.equal(a.status, "fulfilled", a.status === "rejected" ? String(a.reason) : "");
	assert.equal(b.status, "fulfilled", b.status === "rejected" ? String(b.reason) : "");
	const ligne = await query<{ token_rfc3161: string }>(
		"SELECT token_rfc3161 FROM journal_anchor WHERE jour = $1", [jour],
	);
	const tokenDb = ligne.rows[0]?.token_rfc3161;
	assert.ok(tokenDb === jetonA || tokenDb === jetonB);
	const publie = JSON.parse(await readFile(`${dossier}/journal_root_${jour}.json`, "utf8")) as Record<string, unknown>;
	assert.equal(publie.token_rfc3161, tokenDb, "le fichier ne doit jamais porter le jeton du perdant");
});
});
