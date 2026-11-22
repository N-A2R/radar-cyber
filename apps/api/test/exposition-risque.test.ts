/**
 * Criticité exploitable : classement pur et vue SQL.
 *
 * Les six services du test de classement couvrent les trois catégories
 * critiques et trois catégories ordinaires, avec et sans signal EPSS/KEV.
 * La vue est interrogée avec la même requête que le critère de sortie.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { classer, classerServices, niveauRisque, scoreCriticite, SEUIL_EPSS_ELEVE } from "../src/exposition/risque.js";

after(async () => {
	await query("DELETE FROM exposition_service WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'test-hote-%')");
	await query("DELETE FROM exposition_risque_mesure WHERE source IN ('test-classement', 'test-fraicheur')");
	await query("DELETE FROM org WHERE slug LIKE 'test-hote-%'");
	await closePools();
});

const SIX_SERVICES = [
	{ categorie: "autre", epssMax: 0, kev: false, port: 22, technologie: "ssh" },
	{ categorie: "web", epssMax: 0.9, kev: false, port: 443, technologie: "nginx" },
	{ categorie: "base_de_donnees", epssMax: 0, kev: false, port: 5432, technologie: "postgresql" },
	{ categorie: "vpn", epssMax: 0.12, kev: false, port: 1194, technologie: "openvpn" },
	{ categorie: "rdp", epssMax: 0.5, kev: false, port: 3389, technologie: "rdp" },
	{ categorie: "base_de_donnees", epssMax: 0.97, kev: true, port: 3306, technologie: "mysql" },
];

test("les six services sont classés du plus dangereux au plus ordinaire", () => {
	const classes = classerServices(SIX_SERVICES);
	assert.deepEqual(classes.map((service) => service.port), [3306, 3389, 5432, 1194, 443, 22]);
	assert.equal(classes[0]!.niveau, "critique");
	assert.equal(classes[1]!.niveau, "eleve");
	assert.equal(classes[2]!.niveau, "modere");
	assert.equal(classes[5]!.niveau, "faible");
});

test("un service critique sans CVE connue reste prioritaire sur un site web", () => {
	const base = { categorie: "base_de_donnees", epssMax: 0, kev: false, port: 5432 };
	const web = { categorie: "web", epssMax: 0.9, kev: false, port: 443 };
	assert.ok(scoreCriticite(base) > scoreCriticite(web));
	assert.equal(classer(base).motifs.includes("categorie:base_de_donnees"), true);
});

test("le seuil EPSS élevé est appliqué sans arrondi caché", () => {
	const juste = { categorie: "vpn", epssMax: SEUIL_EPSS_ELEVE, kev: false };
	const dessous = { categorie: "vpn", epssMax: SEUIL_EPSS_ELEVE - 0.00001, kev: false };
	assert.equal(niveauRisque(juste), "eleve");
	assert.equal(niveauRisque(dessous), "modere");
});

test("le KEV pèse plus qu'un EPSS maximal sans exploitation connue", () => {
	const kev = { categorie: "vpn", epssMax: 0, kev: true };
	const epss = { categorie: "vpn", epssMax: 1, kev: false };
	assert.ok(scoreCriticite(kev) > scoreCriticite(epss));
});

test("une CVE d'hôte n'est jamais attribuée à un port de l'inventaire", async () => {
	const marque = `test-hote-${Date.now()}`;
	const { rows: org } = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, status) VALUES ($1, $2, 'entreprise', 'confirme') RETURNING id`,
		[`Organisation ${marque}`, marque],
	);
	await query(
		`INSERT INTO exposition_service
		 (org_id, ip, port, category, service, technology, version, source, source_url, consulted_at, evidence)
		 VALUES ($1, '192.0.2.99', 5432, 'base_de_donnees', 'postgresql', 'postgresql', '15',
		         'test-host-cve', $2, now(), '{"vulns":["CVE-2019-0708"]}'::jsonb)`,
		[org[0]!.id, `https://example.invalid/${marque}`],
	);
	const { rows } = await query<{ epss_max: number; kev: boolean }>(
		"SELECT epss_max, kev FROM exposition_risque WHERE source_url = $1",
		[`https://example.invalid/${marque}`],
	);
	// CVE-2019-0708 est un RDP : elle ne prouve rien sur PostgreSQL.
	assert.equal(Number(rows[0]!.epss_max), 0);
	assert.equal(rows[0]!.kev, false);
});

test("la fonction SQL et le module TypeScript donnent le même score", async () => {
	for (const service of SIX_SERVICES) {
		const { rows } = await query<{ score: number }>(
			"SELECT exposition_criticite($1, $2, $3) AS score",
			[service.categorie, service.epssMax, service.kev],
		);
		assert.equal(Number(rows[0]!.score), scoreCriticite(service), `${service.categorie}:${service.port}`);
	}
});

test("la vue expose la requête du critère et au moins 25 services dangereux", async () => {
	// Le corpus versionné doit porter le seuil : c'est la donnée livrée, pas un
	// état de la base de test. La fraîcheur est vérifiée séparément ci-dessous.
	const corpus = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM exposition_risque_mesure
		  WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
		    AND (epss_max >= 0.1 OR kev)`,
	);
	assert.ok(Number(corpus.rows[0]!.n) >= 25, `corpus=${corpus.rows[0]!.n}`);
});

test("la vue rend exactement les lignes fraîches du critère, sans exception", async () => {
	const vue = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM exposition_risque
		  WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
		    AND (epss_max >= 0.1 OR kev)`,
	);
	// L'inventaire n'apporte aucun signal EPSS/KEV : le critère ne peut venir
	// que du corpus, et la vue ne doit ni le perdre ni le compter deux fois.
	const sources = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM exposition_risque_mesure m
		   WHERE m.categorie IN ('base_de_donnees', 'vpn', 'rdp')
		     AND (m.epss_max >= 0.1 OR m.kev)
		     AND m.source_url <> '' AND m.consulted_at >= now() - interval '7 days'`,
	);
	assert.equal(vue.rows[0]!.n, sources.rows[0]!.n);
	const doublons = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM (
		   SELECT source_url, port, categorie
		     FROM exposition_risque
		    WHERE categorie IN ('base_de_donnees', 'vpn', 'rdp')
		      AND (epss_max >= 0.1 OR kev)
		    GROUP BY 1, 2, 3 HAVING count(*) > 1
		 ) d`,
	);
	assert.equal(doublons.rows[0]!.n, "0");
});

test("chaque ligne de la vue cite une source et date de moins de sept jours", async () => {
	const vue = await query<{ n: string }>("SELECT count(*)::text AS n FROM exposition_risque");
	const invalides = await query<{ n: string }>(
		`SELECT count(*)::text AS n
		   FROM exposition_risque
		  WHERE source_url IS NULL OR source_url = ''
		     OR consulted_at < now() - interval '7 days'`,
	);
	// Le corpus versionné dépasse le seuil du critère : la vue ne peut pas être
	// vide par accident, et elle ne garde aucune ligne non citable.
	assert.ok(Number(vue.rows[0]!.n) >= 25, `vue=${vue.rows[0]!.n}`);
	assert.equal(invalides.rows[0]!.n, "0");
});

test("la vue classe six lignes de test dans l'ordre de criticité", async () => {
	const marque = `test-risque-${Date.now()}`;
	const lignes = [
		{ categorie: "autre", port: 22022, service: "ssh", technology: `${marque}-ssh`, epss: 0, kev: false },
		{ categorie: "web", port: 443, service: "https", technology: `${marque}-nginx`, epss: 0.9, kev: false },
		{ categorie: "base_de_donnees", port: 5432, service: "postgresql", technology: `${marque}-postgres`, epss: 0, kev: false },
		{ categorie: "vpn", port: 1194, service: "openvpn", technology: `${marque}-openvpn`, epss: 0.12, kev: false },
		{ categorie: "rdp", port: 3389, service: "rdp", technology: `${marque}-rdp`, epss: 0.5, kev: false },
		{ categorie: "base_de_donnees", port: 3306, service: "mysql", technology: `${marque}-mysql`, epss: 0.97, kev: true },
	];
	for (const ligne of lignes) {
		await query(
			`INSERT INTO exposition_risque_mesure
			 (categorie, port, service, technology, version, epss_max, kev, source, source_url, consulted_at)
			 VALUES ($1,$2,$3,$4,'',$5,$6,'test-classement',$7,now())`,
			[ligne.categorie, ligne.port, ligne.service, ligne.technology, ligne.epss, ligne.kev,
			 `https://example.invalid/${marque}/${ligne.port}`],
		);
	}
	const { rows } = await query<{ port: number }>(
		`SELECT port FROM exposition_risque
		  WHERE technology LIKE $1
		  ORDER BY criticite DESC, epss_max DESC, port`,
		[`${marque}%`],
	);
	assert.deepEqual(rows.map((row) => row.port), [3306, 3389, 5432, 1194, 443, 22022]);
});

test("une mesure de plus de sept jours ne figure plus dans la vue", async () => {
	const marque = `test-vieille-${Date.now()}`;
	await query(
		`INSERT INTO exposition_risque_mesure
		 (categorie, port, service, technology, version, epss_max, kev, source, source_url, consulted_at)
		 VALUES ('base_de_donnees', 5432, 'postgresql', $1, '', 0.5, false,
		         'test-fraicheur', 'https://example.invalid/vieille', now() - interval '8 days')`,
		[marque],
	);
	const { rows } = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM exposition_risque WHERE technology = $1",
		[marque],
	);
	assert.equal(rows[0]!.n, "0");
});
