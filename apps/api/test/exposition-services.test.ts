/**
 * Inventaire d'exposition : lecture des réponses InternetDB et persistance.
 *
 * Le réseau est interdit dans ces tests : on passe des réponses enregistrées
 * sous forme de littéraux. La base de test jetable reçoit la migration 051.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	analyserCpe,
	categoriePort,
	enregistrerServices,
	nomService,
	servicesDepuisInternetDb,
} from "../src/exposition/services.js";

after(async () => {
	await query("DELETE FROM exposition_service WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'exposition-test-%')");
	await query("DELETE FROM org WHERE slug LIKE 'exposition-test-%'");
	await closePools();
});

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
