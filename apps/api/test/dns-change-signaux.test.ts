/**
 * Signaux de détection DNS : quatre snapshots synthétiques, exactitude des
 * bascules A/MX et comptage SQL du critère. Aucun réseau, aucune donnée réelle :
 * seules des adresses de documentation (RFC 5737) et des domaines forgés.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { query } from "../src/db.js";
import { detecterChangementsConsecutifs } from "../src/dns/changements.js";
import type { DnsSnapshot } from "../src/dns/historique.js";
import { enregistrerSnapshot } from "../src/dns/store.js";

const TAG = `dcs${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const DOMAINE = `signal-${TAG}.fr`;
const MASSE = Array.from({ length: 30 }, (_, i) => `masse-${TAG}-${String(i).padStart(2, "0")}.fr`);
const T1 = "2026-11-01T08:00:00.000Z";
const T2 = "2026-11-02T08:00:00.000Z";
const T3 = "2026-11-03T08:00:00.000Z";
const T4 = "2026-11-04T08:00:00.000Z";

function observation(
	domain: string,
	observedAt: string,
	overrides: Partial<DnsSnapshot> = {},
): DnsSnapshot {
	return {
		domain,
		observedAt,
		a: ["192.0.2.10"],
		aaaa: [],
		mx: ["mx1.google.com"],
		ns: ["ns1.ovh.net"],
		ptr: {},
		registrar: "Registrar A",
		errors: [],
		...overrides,
	};
}

async function ajouterDomaines(domaines: readonly string[]): Promise<void> {
	for (const domain of domaines) {
		await query("INSERT INTO dns_domaine (domain, label) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
			domain,
			`${TAG} synthese`,
		]);
	}
}

after(async () => {
	await query("DELETE FROM dns_domaine WHERE domain LIKE $1", [`signal-${TAG}.fr`]);
	await query("DELETE FROM dns_domaine WHERE domain LIKE $1", [`masse-${TAG}-%`]);
});

test("quatre snapshots synthétiques détectent exactement 2 changements A et 1 MX", async () => {
	await ajouterDomaines([DOMAINE]);
	const snapshots = [
		observation(DOMAINE, T1),
		observation(DOMAINE, T2, { a: ["192.0.2.11"] }),
		observation(DOMAINE, T3, { a: ["192.0.2.11"], mx: ["mx2.google.com"] }),
		observation(DOMAINE, T4, { a: ["192.0.2.12"], mx: ["mx2.google.com"] }),
	];
	for (const snapshot of snapshots) await enregistrerSnapshot(snapshot);

	const rapport = await detecterChangementsConsecutifs({ domaines: [DOMAINE] });
	assert.equal(rapport.paires, 3);
	assert.equal(rapport.changements, 3);
	assert.equal(rapport.ecrits, 3);

	const lignes = await query<{ kind: string }>(
		"SELECT kind FROM dns_change WHERE domain = $1 ORDER BY detected_at, id",
		[DOMAINE],
	);
	assert.deepEqual(lignes.rows.map((l) => l.kind), ["A", "MX", "A"]);
	assert.equal(lignes.rows.filter((l) => l.kind === "A").length, 2);
	assert.equal(lignes.rows.filter((l) => l.kind === "MX").length, 1);
	assert.equal(lignes.rows.some((l) => l.kind !== "A" && l.kind !== "MX"), false);

	const rejeu = await detecterChangementsConsecutifs({ domaines: [DOMAINE] });
	assert.equal(rejeu.ecrits, 0, "rejouer la détection ne duplique aucun signal");
});

test("la table dns_change comptabilise au moins 30 signaux A/MX/NS", async () => {
	await ajouterDomaines(MASSE);
	for (const domain of MASSE) {
		await enregistrerSnapshot(observation(domain, T1));
		await enregistrerSnapshot(observation(domain, T4, { a: ["192.0.2.99"] }));
	}

	const rapport = await detecterChangementsConsecutifs({ domaines: [...MASSE] });
	assert.equal(rapport.paires, MASSE.length);
	assert.equal(rapport.changements, MASSE.length);

	const comptage = await query<{ n: string }>(
		"SELECT count(*) AS n FROM dns_change WHERE kind IN ('A','MX','NS')",
	);
	console.log("SELECT count(*) FROM dns_change WHERE kind IN ('A','MX','NS') >= 30 ;");
	console.log(comptage.rows[0]!.n);
	assert.ok(Number(comptage.rows[0]!.n) >= 30);
});
