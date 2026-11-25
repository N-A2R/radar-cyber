/** Fusion des fichiers exposition-*.test.ts : un comportement par test. */
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
	administrationCandidate, type AdministrationRow,
} from "../src/exposition/administration-site.js";
import { dilaCandidate } from "../src/exposition/dila-local.js";
import { educationCandidate, type EducationRow } from "../src/exposition/education-site.js";
import { finessSiteCandidate } from "../src/exposition/finess-site.js";
import { osmSiretCandidate, type OsmSiretFeature } from "../src/exposition/osm-siret.js";
import {
	publicSiteCandidate, publicWebsite, sirenFromIdentifier,
} from "../src/exposition/public-site.js";
import { registryIdentifierCandidate } from "../src/exposition/registry-identifier-site.js";
import {
	classer, classerServices, niveauRisque, scoreCriticite, SEUIL_EPSS_ELEVE,
} from "../src/exposition/risque.js";
import {
	parseRnaCsvLine, rnaCandidate, rnaRowFromLine,
} from "../src/exposition/rna-site.js";
import {
	analyserCpe, categoriePort, enregistrerServices,
	nomService, servicesDepuisInternetDb,
} from "../src/exposition/services.js";
import { hostFromUrl, isSameSiteHost } from "../src/exposition/site-zone.js";
import {
	WEB_SERVICE_SOURCE,
	enregistrerServicesWeb,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
} from "../src/exposition/web-service.js";
import { wikidataIdentifierCandidate } from "../src/exposition/wikidata-identifier-site.js";

const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

// Un seul nettoyage pour toute la suite fusionnée.
after(async () => {
	await query("DELETE FROM exposition_service WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'test-hote-%')");
	await query("DELETE FROM exposition_risque_mesure WHERE source IN ('test-classement', 'test-fraicheur')");
	await query("DELETE FROM org WHERE slug LIKE 'test-hote-%'");
	await query("DELETE FROM exposition_service WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'exposition-test-%')");
	await query("DELETE FROM org WHERE slug LIKE 'exposition-test-%'");
	await closePools();
});

describe("administration-site qualification", () => {
	const row: AdministrationRow = {
		siren: "123456789",
		code_insee_commune: "33016",
		site_internet: '[{"libelle":"","valeur":"www.exemple.fr/accueil"}]',
	};

	test("keeps public identifiers and the declared website", () => {
		assert.deepEqual(administrationCandidate(row, NA_DEPARTMENTS), {
			siren: "123456789",
			insee: "33016",
			website: "https://www.exemple.fr/accueil",
			domain: "exemple.fr",
			dept: "33",
		});
	});

	test("skips a third-party entry before the own website", () => {
		const site_internet = JSON.stringify([
			{ valeur: "https://facebook.com/groupe" },
			{ valeur: "https://exemple.fr" },
		]);
		assert.equal(administrationCandidate({ ...row, site_internet }, NA_DEPARTMENTS)?.domain, "exemple.fr");
	});

	test("rejects an establishment outside Nouvelle-Aquitaine", () => {
		assert.equal(administrationCandidate({ ...row, code_insee_commune: "75056" }, NA_DEPARTMENTS), null);
	});

	test("rejects an entry without a valid SIREN", () => {
		assert.equal(administrationCandidate({ ...row, siren: "SIREN" }, NA_DEPARTMENTS), null);
	});

	test("rejects an entry without an INSEE commune code", () => {
		assert.equal(administrationCandidate({ ...row, code_insee_commune: null }, NA_DEPARTMENTS), null);
	});
});

describe("dila-local candidate qualification", () => {
	test("accepts a declared website on a SIRET in Nouvelle-Aquitaine", () => {
		assert.deepEqual(dilaCandidate({
			siret: "21160003600019",
			site_internet: [{ valeur: "https://www.agris.fr/" }],
			adresse: [{ code_postal: "16000" }],
		}, NA_DEPARTMENTS), {
			siren: "211600036",
			website: "https://www.agris.fr/",
			domain: "agris.fr",
			dept: "16",
		});
	});

	test("rejects an address outside Nouvelle-Aquitaine", () => {
		assert.equal(dilaCandidate({
			siret: "21160003600019",
			site_internet: [{ valeur: "https://www.agris.fr/" }],
			adresse: [{ code_postal: "75001" }],
		}, NA_DEPARTMENTS), null);
	});
});

describe("education-site qualification", () => {
	const row: EducationRow = {
		Identifiant_de_l_etablissement: "0331234X",
		SIREN_SIRET: "12345678900012",
		Code_departement: "033",
		Web: "www.exemple.fr/accueil",
	};

	test("keeps the public UAI, SIREN and declared website", () => {
		assert.deepEqual(educationCandidate(row, NA_DEPARTMENTS), {
			uai: "0331234X",
			siren: "123456789",
			website: "https://www.exemple.fr/accueil",
			domain: "exemple.fr",
			dept: "33",
		});
	});

	test("rejects an establishment outside Nouvelle-Aquitaine", () => {
		assert.equal(educationCandidate({ ...row, Code_departement: "075" }, NA_DEPARTMENTS), null);
	});

	test("rejects a third-party social website", () => {
		assert.equal(educationCandidate({ ...row, Web: "https://facebook.com/ecole" }, NA_DEPARTMENTS), null);
	});

	test("rejects a row without a valid UAI", () => {
		assert.equal(educationCandidate({ ...row, Identifiant_de_l_etablissement: "" }, NA_DEPARTMENTS), null);
	});
});

describe("finess-site qualification", () => {
	test("keeps a nine-digit FINESS and its declared own website", () => {
		assert.deepEqual(finessSiteCandidate("160000337", "https://www.ch-ruffec.fr/"), {
			id: "160000337",
			website: "https://www.ch-ruffec.fr",
			domain: "ch-ruffec.fr",
		});
	});

	test("rejects a public directory page about an establishment", () => {
		assert.equal(
			finessSiteCandidate("160002093", "https://www.pour-les-personnes-agees.gouv.fr/annuaire/ehpad/160002093"),
			null,
		);
	});

	test("rejects an identifier that is not nine digits", () => {
		assert.equal(finessSiteCandidate("16000033700027", "https://ch-ruffec.fr"), null);
	});

	test("rejects a website hosted by a third party", () => {
		assert.equal(finessSiteCandidate("160000337", "https://facebook.com/etablissement"), null);
	});
});

describe("osm-siret candidate qualification", () => {
	function feature(properties: OsmSiretFeature["properties"]): OsmSiretFeature {
		return { properties };
	}

	test("accepts a SIRET-derived SIREN and a contact website", () => {
		const candidate = osmSiretCandidate(feature({
			"@osmId": "node/1",
			"ref:FR:SIRET": "12345678900011",
			"contact:website": "https://www.exemple-na.fr/contact",
		}));
		assert.deepEqual(candidate, {
			osmId: "node/1",
			siren: "123456789",
			website: "https://www.exemple-na.fr/contact",
			domain: "exemple-na.fr",
		});
	});

	test("rejects a third-party profile as a service domain", () => {
		assert.equal(
			osmSiretCandidate(feature({
				"ref:FR:SIREN": "123456789",
				website: "https://www.facebook.com/exemple-na/",
			})),
			null,
		);
	});

	test("rejects a feature without a SIREN or SIRET reference", () => {
		assert.equal(
			osmSiretCandidate(feature({ website: "https://exemple-na.fr/" })),
			null,
		);
	});
});

describe("public-site qualification", () => {
	test("completes a protocol-relative declared website", () => {
		assert.deepEqual(publicWebsite("//www.amadea.org"), {
			website: "https://www.amadea.org",
			domain: "amadea.org",
		});
	});

	test("rejects a third-party social host", () => {
		assert.equal(publicWebsite("https://www.facebook.com/association"), null);
	});

	test("derives the same SIREN from a SIRET and from a SIREN", () => {
		assert.equal(sirenFromIdentifier("78121327700028"), "781213277");
		assert.equal(sirenFromIdentifier("781213277"), "781213277");
	});

	test("rejects an identifier that is neither SIREN nor SIRET", () => {
		assert.equal(sirenFromIdentifier("78A1213277"), null);
	});

	test("requires a Nouvelle-Aquitaine postal code", () => {
		assert.equal(publicSiteCandidate("78121327700028", "https://association.fr", "75001", NA_DEPARTMENTS), null);
	});
});

describe("registry-identifier-site qualification", () => {
	test("keeps a data.inclusion SIRET and its declared website", () => {
		assert.deepEqual(registryIdentifierCandidate("siret", "30247640300027", "https://www.exemple.fr/accueil"), {
			kind: "siret",
			id: "30247640300027",
			website: "https://www.exemple.fr/accueil",
			domain: "exemple.fr",
		});
	});

	test("keeps a nine-digit FINESS number from OpenStreetMap", () => {
		assert.equal(registryIdentifierCandidate("finess", "860000017", "exemple.fr")?.id, "860000017");
	});

	test("rejects a SIRET that is not fourteen digits", () => {
		assert.equal(registryIdentifierCandidate("siret", "302476403", "https://exemple.fr"), null);
	});

	test("rejects a FINESS number that is not nine digits", () => {
		assert.equal(registryIdentifierCandidate("finess", "exemple", "https://exemple.fr"), null);
	});

	test("rejects a website hosted by a third party", () => {
		assert.equal(registryIdentifierCandidate("siret", "30247640300027", "https://facebook.com/groupe"), null);
	});
});

describe("criticité exploitable : classement pur et vue SQL", () => {
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
});

describe("RNA association qualification", () => {
	test("accepts an RNA row with a declared website", () => {
		assert.deepEqual(rnaCandidate({
			siret: "88319750100017",
			siteweb: "//les-ailes-chalaisiennes.com/",
			adrs_codepostal: "17230",
		}, NA_DEPARTMENTS), {
			siren: "883197501",
			website: "https://les-ailes-chalaisiennes.com",
			domain: "les-ailes-chalaisiennes.com",
			dept: "17",
		});
	});

	test("keeps semicolons and doubled quotes inside a CSV field", () => {
		assert.deepEqual(parseRnaCsvLine('"a;b";"c""d"'), ["a;b", 'c"d']);
	});

	test("maps a CSV line to its RNA header columns", () => {
		assert.deepEqual(rnaRowFromLine('"123";"https://example.fr"', ["siret", "siteweb"]), {
			siret: "123",
			siteweb: "https://example.fr",
		});
	});
});

describe("inventaire d'exposition : lecture et persistance", () => {
	test("les ports connus sont classés par famille de service", () => {
		assert.equal(categoriePort(443), "web");
		assert.equal(categoriePort(587), "mail");
		assert.equal(categoriePort(1194), "vpn");
		assert.equal(categoriePort(5432), "base_de_donnees");
		assert.equal(categoriePort(3389), "rdp");
		assert.equal(nomService(443), "https");
		assert.equal(nomService(27017), "mongodb");
	});

	test("un CPE 2.3 fournit la technologie et la version", () => {
		assert.deepEqual(analyserCpe("cpe:2.3:a:nginx:nginx:1.24.0:*:*:*:*:*:*:*"), {
			vendor: "nginx", product: "nginx", version: "1.24.0",
		});
		assert.equal(analyserCpe("cpe:2.3:a:gitlab:gitlab:*:*:*:*:*:*:*:*")?.version, null);
		assert.equal(analyserCpe("nginx 1.24"), null);
	});

	test("les CPE URI 2.2 renvoyés par InternetDB sont reconnus", () => {
		assert.deepEqual(analyserCpe("cpe:/a:exim:exim:4.100.1"), {
			vendor: "exim", product: "exim", version: "4.100.1",
		});
		const services = servicesDepuisInternetDb({
			ip: "192.0.2.30", ports: [25, 80],
			cpes: ["cpe:/a:exim:exim:4.100.1", "cpe:/a:apache:http_server:2.4.71"],
		});
		assert.equal(services.find((s) => s.port === 25)?.version, "4.100.1");
		assert.equal(services.find((s) => s.port === 80)?.version, "2.4.71");
	});

	test("un CPE de base de données n'est pas attribué à un autre port de base de données", () => {
		const services = servicesDepuisInternetDb({
			ip: "192.0.2.30",
			ports: [3306, 27017],
			cpes: ["cpe:2.3:a:mysql:mysql:5.7.33:*:*:*:*:*:*:*"],
		});
		const mysql = services.find((s) => s.port === 3306);
		const mongodb = services.find((s) => s.port === 27017);
		assert.equal(mysql?.technology, "mysql");
		assert.equal(mysql?.version, "5.7.33");
		// Le CPE est au niveau de l'hôte : il ne transforme pas 27017 en MySQL.
		assert.equal(mongodb?.technology, "mongodb");
		assert.equal(mongodb?.version, null);
	});

	test("les CPE sont attribués uniquement au port compatible", () => {
		const consulteLe = new Date("2026-11-21T12:00:00Z");
		const services = servicesDepuisInternetDb({
			ip: "192.0.2.10",
			ports: [22, 443, 5432],
			cpes: ["cpe:2.3:a:nginx:nginx:1.24.0:*:*:*:*:*:*:*", "cpe:2.3:a:postgresql:postgresql:15.4:*:*:*:*:*:*:*"],
			hostnames: ["exemple.na.fr"],
			tags: ["self-signed"],
			vulns: [],
		}, { consulteLe, domaineResolu: "exemple.na.fr" });

		assert.equal(services.length, 3);
		const web = services.find((s) => s.port === 443);
		const db = services.find((s) => s.port === 5432);
		const ssh = services.find((s) => s.port === 22);
		assert.equal(web?.technology, "nginx");
		assert.equal(web?.version, "1.24.0");
		assert.equal(db?.technology, "postgresql");
		assert.equal(db?.version, "15.4");
		assert.equal(ssh?.technology, "ssh");
		assert.equal(ssh?.version, null);
		assert.deepEqual(web?.evidence.hostnames, ["exemple.na.fr"]);
		assert.equal(web?.source, "shodan-internetdb");
		assert.equal(web?.sourceUrl, "https://internetdb.shodan.io/192.0.2.10");
		assert.equal(web?.consultedAt.toISOString(), consulteLe.toISOString());
	});

	test("l'écriture est idempotente et garde la source et la date de consultation", async () => {
		const slug = ` exposition-test-${Date.now()} `;
		const org = await query<{ id: number }>(
			"INSERT INTO org (name, slug, kind, dept, domain) VALUES ($1,$2,$3,$4,$5) RETURNING id",
			["Organisation exposition test", slug.trim(), "collectivite", "33", "exemple.na.fr"],
		);
		const orgId = org.rows[0]!.id;
		const consulteLe = new Date("2026-11-21T09:30:00Z");
		const mesure = servicesDepuisInternetDb(
			{ ip: "192.0.2.20", ports: [443], cpes: ["cpe:2.3:a:apache:http_server:2.4.57:*:*:*:*:*:*:*"] },
			{ consulteLe },
		);
		assert.equal(await enregistrerServices(orgId, mesure), 1);
		assert.equal(await enregistrerServices(orgId, mesure), 1);

		const relue = await query<{
			category: string; technology: string; version: string; source: string;
			source_url: string; consulted_at: Date;
		}>("SELECT * FROM exposition_service WHERE org_id = $1", [orgId]);
		assert.equal(relue.rows.length, 1);
		assert.equal(relue.rows[0]!.category, "web");
		assert.equal(relue.rows[0]!.technology, "http_server");
		assert.equal(relue.rows[0]!.version, "2.4.57");
		assert.equal(relue.rows[0]!.source, "shodan-internetdb");
		assert.match(relue.rows[0]!.source_url, /^https:\/\/internetdb\.shodan\.io\//);
		assert.equal(new Date(relue.rows[0]!.consulted_at).toISOString(), consulteLe.toISOString());
	});
});

describe("site-zone qualification", () => {
	test("keeps the exact observed host of a final URL", () => {
		assert.equal(hostFromUrl("https://jehan.lyc-duperier.fr/accueil?x=1"), "jehan.lyc-duperier.fr");
	});

	test("accepts a named subdomain of the declared registrable domain", () => {
		assert.equal(isSameSiteHost("jehan.lyc-duperier.fr", "lyc-duperier.fr"), true);
	});

	test("accepts the declared host itself", () => {
		assert.equal(isSameSiteHost("rions.fr", "rions.fr"), true);
	});

	test("rejects a different registrable domain", () => {
		assert.equal(isSameSiteHost("autre-exemple.fr", "exemple.fr"), false);
	});

	test("rejects a third-party social host", () => {
		assert.equal(isSameSiteHost("facebook.com", "facebook.com"), false);
	});
});

describe("exposed web services", () => {
	const consultedAt = new Date("2026-11-22T10:00:00Z");

	function proof(overrides: Partial<VerifiedWebsiteRow> = {}): VerifiedWebsiteRow {
		return {
			orgId: 1,
			dept: "33",
			domain: "exemple-na.fr",
			source: "wikidata:P856:http200",
			confidence: 0.95,
			proof: { statut: 200, urlFinale: "https://www.exemple-na.fr/contact", titre: "secret" },
			...overrides,
		};
	}

	test("accepts a 200 answer served by the organisation domain", () => {
		const service = webServiceFromVerifiedWebsite(proof(), "203.0.113.10", consultedAt);
		assert.ok(service);
		assert.equal(service.port, 443);
		assert.equal(service.service, "https");
		assert.equal(service.source, WEB_SERVICE_SOURCE);
		assert.equal(service.sourceUrl, "https://exemple-na.fr/contact");
		assert.equal(service.evidence.status, 200);
	});

	test("rejects a final URL on another domain", () => {
		assert.equal(
			webServiceFromVerifiedWebsite(
				proof({ proof: { statut: 200, urlFinale: "https://autre.fr/" } }),
				"203.0.113.10",
				consultedAt,
			),
			null,
		);
	});

	test("rejects an organisation outside Nouvelle-Aquitaine", () => {
		assert.equal(webServiceFromVerifiedWebsite(proof({ dept: "75" }), "203.0.113.10", consultedAt), null);
	});

	test("rejects a proof without a measured HTTP 200", () => {
		assert.equal(webServiceFromVerifiedWebsite(proof({ proof: { statut: 301 } }), "203.0.113.10", consultedAt), null);
	});

	test("rejects a low-confidence attribution", () => {
		assert.equal(webServiceFromVerifiedWebsite(proof({ confidence: 0.4 }), "203.0.113.10", consultedAt), null);
	});

	test("rejects a private resolution instead of inventing a public IP", () => {
		assert.equal(webServiceFromVerifiedWebsite(proof(), "127.0.0.1", consultedAt), null);
	});

	test("stores technical evidence only", () => {
		const service = webServiceFromVerifiedWebsite(proof(), "203.0.113.10", consultedAt)!;
		assert.deepEqual(Object.keys(service.evidence).sort(), ["domain", "provider", "status", "url"]);
		assert.ok(!JSON.stringify(service.evidence).includes("secret"));
	});

	test("writing the same service twice keeps one row", async () => {
		const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const created = await query<{ id: number }>(
			"INSERT INTO org (name, slug, kind, dept, domain) VALUES ($1,$2,$3,$4,$5) RETURNING id",
			["Web service test", `web-service-test-${suffix}`, "entreprise", "33", `test-${suffix}.na.fr`],
		);
		const orgId = created.rows[0]!.id;
		try {
			const service = webServiceFromVerifiedWebsite(
				proof({ orgId, domain: `test-${suffix}.na.fr`, proof: { statut: 200, urlFinale: `https://test-${suffix}.na.fr/` } }),
				"203.0.113.11",
				consultedAt,
			)!;
			assert.equal(await enregistrerServicesWeb([service]), 1);
			assert.equal(await enregistrerServicesWeb([service]), 1);
			const rows = await query("SELECT * FROM exposition_service WHERE org_id = $1", [orgId]);
			assert.equal(rows.rows.length, 1);
		} finally {
			await query("DELETE FROM exposition_service WHERE org_id = $1", [orgId]);
			await query("DELETE FROM org WHERE id = $1", [orgId]);
		}
	});

	test("measurement counts distinct organisations and ignores other regions", async () => {
		const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
		const created = await query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, dept, domain) VALUES
			   ($1,$2,'entreprise','33',$3),
			   ($4,$5,'entreprise','33',$6),
			   ($7,$8,'entreprise','75',$9)
			 RETURNING id`,
			[
				"NA one", `measure-na-one-${suffix}`, `one-${suffix}.na.fr`,
				"NA two", `measure-na-two-${suffix}`, `two-${suffix}.na.fr`,
				"Outside one", `measure-out-one-${suffix}`, `out-${suffix}.na.fr`,
			],
		);
		const [naOne, naTwo, outside] = created.rows.map((row) => row.id);
		try {
			const before = await measureExposition();
			const services = [naOne, naTwo, outside].map((orgId, index) =>
				webServiceFromVerifiedWebsite(
					proof({
						orgId,
						domain: `host-${index}-${suffix}.na.fr`,
						proof: { statut: 200, urlFinale: `https://host-${index}-${suffix}.na.fr/` },
					}),
					`203.0.113.${20 + index}`,
					consultedAt,
				)!,
			);
			await enregistrerServicesWeb(services);
			const after = await measureExposition();
			assert.equal(after.organisationsWithService - before.organisationsWithService, 2);
			assert.equal((after.bySource[WEB_SERVICE_SOURCE] ?? 0) - (before.bySource[WEB_SERVICE_SOURCE] ?? 0), 2);
		} finally {
			for (const orgId of [naOne, naTwo, outside]) {
				await query("DELETE FROM exposition_service WHERE org_id = $1", [orgId]);
				await query("DELETE FROM org WHERE id = $1", [orgId]);
			}
		}
	});
});

describe("wikidata-identifier-site qualification", () => {
	test("joins a SIRET by its public SIREN prefix", () => {
		assert.deepEqual(wikidataIdentifierCandidate("siret", "30247640300027", "https://www.exemple.fr/accueil"), {
			kind: "siret",
			id: "302476403",
			website: "https://www.exemple.fr/accueil",
			domain: "exemple.fr",
		});
	});

	test("keeps a school UAI as its own public identifier", () => {
		assert.equal(wikidataIdentifierCandidate("uai", "0751721N", "exemple.fr")?.id, "0751721N");
	});

	test("rejects an identifier that is neither a SIRET nor a UAI", () => {
		assert.equal(wikidataIdentifierCandidate("uai", "30247640300027", "https://exemple.fr"), null);
	});

	test("rejects a website hosted by a third party", () => {
		assert.equal(wikidataIdentifierCandidate("siret", "30247640300027", "https://facebook.com/groupe"), null);
	});
});
