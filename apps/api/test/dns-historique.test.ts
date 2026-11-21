/**
 * Historique DNS : périmètre, deux relevés, détection de changement.
 *
 * Chaque comportement a son test : normalisation, comparaison pure, absence de
 * faux changement sur panne DoH, persistance de 60 domaines sur deux relevés
 * et détection des changements significatifs. Les fetchers sont injectés :
 * aucun test ne touche le réseau ni la base de production.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { query } from "../src/db.js";
import {
	diffSnapshots,
	normalizeDomain,
	providerFor,
	reverseIpv4,
	type DnsFetcher,
	type DnsProvider,
	type DnsSnapshot,
} from "../src/dns/historique.js";
import { effectuerReleve } from "../src/dns/releve.js";
import { changementsRecents, chargerCatalogue } from "../src/dns/store.js";

const TAG = `dh${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const NOMBRE_DOMAINES = 60;
const CHANGES = 5;
const DOMAINES = Array.from(
	{ length: NOMBRE_DOMAINES },
	(_, i) => `hist-${TAG}-${String(i).padStart(2, "0")}.fr`,
);
const T1 = new Date("2026-11-20T08:00:00.000Z");
const T2 = new Date("2026-11-21T08:00:00.000Z");

const CATALOGUE: DnsProvider[] = [
	{ suffix: "google.com", name: "Google Workspace", category: "mail", mode: "suffix" },
	{ suffix: "ovh.net", name: "OVHcloud", category: "dns", mode: "suffix" },
	{ suffix: "cloudflare.com", name: "Cloudflare", category: "dns", mode: "suffix" },
];

function snapshot(domain: string, observedAt: string, overrides: Partial<DnsSnapshot> = {}): DnsSnapshot {
	return {
		domain,
		observedAt,
		a: ["192.0.2.10"],
		aaaa: ["2001:db8::10"],
		mx: ["mx1.google.com"],
		ns: ["ns1.ovh.net"],
		ptr: { "192.0.2.10": ["host.ovh.net"] },
		registrar: "Registrar A",
		errors: [],
		...overrides,
	};
}

/** Premier relevé : état stable pour tous les domaines. */
const fetcher1: DnsFetcher = {
	async doh(name, type) {
		if (name.includes(".in-addr.arpa")) return ["ptr.ovh.net."];
		switch (type) {
			case "A": return ["192.0.2.10"];
			case "AAAA": return ["2001:db8::10"];
			case "MX": return ["10 mx1.google.com."];
			case "NS": return ["ns1.ovh.net."];
			default: return [];
		}
	},
	async rdap() {
		return { registrar: "Registrar A", nameServers: [] };
	},
};

/** Second relevé : cinq domaines changent d'IP, de MX, de NS et de registraire. */
function fetcher2(changed: ReadonlySet<string>): DnsFetcher {
	return {
		async doh(name, type) {
			const boule = [...changed].some((d) => name.includes(d)) || name === "10.2.0.192.in-addr.arpa";
			if (boule) {
				switch (type) {
					case "A": return ["192.0.2.99"];
					case "AAAA": return ["2001:db8::10"];
					case "MX": return ["10 mx.inconnu-hist.example.net."];
					case "NS": return ["ns1.cloudflare.com."];
					case "PTR": return ["ptr.cloudflare.com."];
					default: return [];
				}
			}
			return fetcher1.doh(name, type);
		},
		async rdap(domain) {
			return { registrar: changed.has(domain) ? "Registrar B" : "Registrar A", nameServers: [] };
		},
	};
}

before(async () => {
	const values: string[] = [];
	const params: unknown[] = [];
	DOMAINES.forEach((domain, i) => {
		const base = params.length;
		params.push(`${TAG} org ${i}`, `${TAG}-${i}`, domain);
		values.push(`($${base + 1}, $${base + 2}, 'entreprise', 'Bordeaux', $${base + 3}, 'confirme')`);
	});
	await query(
		`INSERT INTO org (name, slug, kind, city, domain, status) VALUES ${values.join(", ")}`,
		params,
	);
});

after(async () => {
	await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
});

test("normalise un domaine depuis le référentiel sans inventer de racine", () => {
	assert.equal(normalizeDomain("https://www.Exemple.fr/chemin"), "exemple.fr");
	assert.equal(normalizeDomain("EXEMPLE.fr."), "exemple.fr");
	assert.equal(normalizeDomain("https://192.0.2.10/"), null);
	assert.equal(reverseIpv4("192.0.2.10"), "10.2.0.192.in-addr.arpa");
	assert.equal(providerFor("ns1.cloudflare.com", CATALOGUE, ["dns"])?.name, "Cloudflare");
});

test("deux observations différentes produisent les six familles de changement", () => {
	const avant = snapshot("exemple.fr", T1.toISOString());
	const apres = snapshot("exemple.fr", T2.toISOString(), {
		a: ["192.0.2.99"],
		mx: ["mx.inconnu-hist.example.net"],
		ns: ["ns1.cloudflare.com"],
		ptr: { "192.0.2.99": ["ptr.cloudflare.com"] },
		registrar: "Registrar B",
	});
	const kinds = diffSnapshots(avant, apres, CATALOGUE).map((c) => c.kind);
	for (const kind of ["hebergeur", "registrar", "mx-inconnu", "ip", "mx", "ns"] as const) {
		assert.ok(kinds.includes(kind), `changement ${kind} manquant`);
	}
	assert.deepEqual(diffSnapshots(null, apres, CATALOGUE), [], "premier relevé : aucun passé inventé");
});

test("une panne DoH sur un type ne fabrique pas de changement d'IP", () => {
	const avant = snapshot("exemple.fr", T1.toISOString());
	const apres = snapshot("exemple.fr", T2.toISOString(), { errors: ["doh:A: timeout"] });
	assert.equal(diffSnapshots(avant, apres, CATALOGUE).some((c) => c.kind === "ip"), false);
});

test("deux relevés sur 60 domaines alimentent l'historique et détectent 30 changements", async () => {
	const catalogue = await chargerCatalogue();
	assert.ok(catalogue.length > 50, "catalogue des fournisseurs chargé depuis la migration");
	const rapport1 = await effectuerReleve({ fetcher: fetcher1, maintenant: T1, concurrence: 8 });
	assert.equal(rapport1.domaines >= NOMBRE_DOMAINES, true);
	assert.equal(rapport1.snapshots, rapport1.domaines);
	assert.equal(rapport1.changements, 0, "premier relevé sans passé");

	const changed = new Set(DOMAINES.slice(0, CHANGES));
	const rapport2 = await effectuerReleve({ fetcher: fetcher2(changed), maintenant: T2, concurrence: 8 });
	assert.equal(rapport2.snapshots, rapport2.domaines);
	assert.equal(rapport2.changements, CHANGES * 6);

	const followed = await query<{ n: string }>(
		"SELECT count(*) AS n FROM dns_domaine WHERE domain LIKE $1",
		[`hist-${TAG}-%`],
	);
	assert.ok(Number(followed.rows[0]!.n) >= 50, "au moins 50 domaines suivis");

	const lignes = await query<{ domain: string; kind: string; severity: number }>(
		`SELECT c.domain, c.kind, c.severity FROM dns_change c
		  JOIN dns_domaine d ON d.domain = c.domain
		 WHERE d.domain LIKE $1`,
		[`hist-${TAG}-%`],
	);
	assert.equal(lignes.rows.length, CHANGES * 6);
	for (const domain of changed) {
		const kinds = lignes.rows.filter((l) => l.domain === domain).map((l) => l.kind);
		assert.equal(kinds.length, 6, `${domain} : six changements attendus`);
	}
	assert.equal(lignes.rows.some((l) => l.severity === 3), true);

	const observes = await query<{ n: string; domaines: string }>(
		`SELECT count(*) AS n, count(DISTINCT domain) AS domaines FROM dns_snapshot WHERE domain LIKE $1`,
		[`hist-${TAG}-%`],
	);
	assert.equal(Number(observes.rows[0]!.domaines), NOMBRE_DOMAINES);
	assert.equal(Number(observes.rows[0]!.n), NOMBRE_DOMAINES * 2);

	const top = await changementsRecents(5);
	assert.equal(top.length >= 5, true);
	assert.equal(top.every((c) => c.severity === 3 || c.severity === 2), true);
});
