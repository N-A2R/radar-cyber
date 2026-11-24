/**
 * Avantage de nouveauté : quelle source a rapporté un fait en premier.
 *
 * Le fait est identifié par la partie de `dedup_key` après le préfixe de la
 * source (nvd:CVE-x et kev:CVE-x sont le même fait), et l'antériorité par
 * `event.at`. On pilote ici le vrai déclencheur SQL : les événements sont
 * insérés directement en base, comme le font les imports et les rejeux.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, pool, closePools } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

after(async () => { await closePools().catch(() => {}); });

const TAG = `premier-${process.pid}-${Date.now().toString(36)}`;
const PREFIXES = ["nvd", "kev", "certfr"] as const;
const SOURCES = PREFIXES.map((p) => `zz-test-${p}-${TAG}`);
const SOURCE_ID: Record<(typeof PREFIXES)[number], string> = {
	nvd: SOURCES[0]!,
	kev: SOURCES[1]!,
	certfr: SOURCES[2]!,
};

const FAIT_BASCULE = `CVE-2099-${process.pid}-1`;
const FAIT_CONCURRENT = `CVE-2099-${process.pid}-2`;
const FAIT_A = `CVE-2099-${process.pid}-3`;
const FAIT_B = `CVE-2099-${process.pid}-4`;
const FAIT_ISOLE = `FIXTURE-ISOLE-${TAG}`;

function jour(offset: number): Date {
	return new Date(Date.now() + offset * 24 * 3600 * 1000);
}

const INSERT_EVENT = `INSERT INTO event (dedup_key, family, assertion_type, title, at, source_id,
	                                    source_url, evidence)
	 VALUES ($1,'vuln','confirmed_incident',$2,$3,$4,
	         'https://example.invalid/premier-rapport', '{"run_id":"1"}'::jsonb)`;

async function prepareSources(): Promise<void> {
	for (const id of SOURCES) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, format, relevance, enabled)
			 VALUES ($1,$2,'vuln',$3,'narrative','rss','strict',false)
			 ON CONFLICT (id) DO NOTHING`,
			[id, `Source test ${id}`, `https://example.invalid/${id}.xml`],
		);
	}
}

async function insere(prefixe: (typeof PREFIXES)[number], fait: string, at: Date): Promise<number> {
	const { rows } = await query<{ id: number }>(
		`${INSERT_EVENT}
		 ON CONFLICT (dedup_key) DO UPDATE SET at = EXCLUDED.at
		 RETURNING id`,
		[`${prefixe}:${fait}`, `Fait de test ${fait}`, at, SOURCE_ID[prefixe]],
	);
	return rows[0]!.id;
}

async function drapeaux(fait: string): Promise<Record<string, boolean>> {
	const { rows } = await query<{ dedup_key: string; premier_rapport: boolean }>(
		"SELECT dedup_key, premier_rapport FROM event WHERE dedup_key LIKE $1 ORDER BY dedup_key",
		[`%:${fait}`],
	);
	return Object.fromEntries(rows.map((r) => [r.dedup_key.split(":")[0]!, r.premier_rapport]));
}

async function nettoyage(): Promise<void> {
	await supprimerEvenementsArchivees("source_id = ANY($1)", [SOURCES]).catch(() => {});
	await query("DELETE FROM source WHERE id = ANY($1)", [SOURCES]).catch(() => {});
}

/** Le backend de la seconde collecte attend-il le verrou consultatif du fait ? */
async function attendVerrou(pid: number): Promise<boolean> {
	const { rows } = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM pg_stat_activity
		  WHERE pid = $1 AND wait_event_type = 'Lock' AND wait_event = 'advisory'`,
		[pid],
	);
	return rows[0]!.n > 0;
}

test("une source plus tardive ne prend pas l'avantage, une plus ancienne découverte après coup le reprend", async () => {
	try {
		await prepareSources();

		await insere("nvd", FAIT_BASCULE, jour(-3));
		assert.deepEqual(await drapeaux(FAIT_BASCULE), { nvd: true }, "le premier signalement porte l'avantage");

		await insere("kev", FAIT_BASCULE, jour(-2));
		assert.deepEqual(
			await drapeaux(FAIT_BASCULE),
			{ kev: false, nvd: true },
			"une source plus tardive ne prend pas l'avantage",
		);

		// Bascule : une source plus ancienne, découverte après coup, reprend
		// l'avantage ; le signalement jusqu'ici premier perd le drapeau.
		await insere("certfr", FAIT_BASCULE, jour(-4));
		assert.deepEqual(
			await drapeaux(FAIT_BASCULE),
			{ certfr: true, kev: false, nvd: false },
			"la source la plus ancienne, même découverte après coup, devient première",
		);

		// Supprimer le premier signalement promeut le suivant par `at`.
		await supprimerEvenementsArchivees("dedup_key = $1", [`certfr:${FAIT_BASCULE}`]);
		assert.deepEqual(
			await drapeaux(FAIT_BASCULE),
			{ kev: false, nvd: true },
			"la suppression du premier promeut le suivant",
		);

		// Mettre `at` à jour déplace l'antériorité : KEV redevient le premier.
		await query("UPDATE event SET at = $1 WHERE dedup_key = $2", [jour(-1), `nvd:${FAIT_BASCULE}`]);
		assert.deepEqual(
			await drapeaux(FAIT_BASCULE),
			{ kev: true, nvd: false },
			"le drapeau suit le minimum de at après mise à jour",
		);
	} finally {
		await nettoyage();
	}
});

test("deux collectes concurrentes du même fait laissent exactement un premier rapport", async () => {
	await prepareSources();
	const a = await pool.connect();
	const b = await pool.connect();
	try {
		await a.query("BEGIN");
		await a.query(INSERT_EVENT, [`nvd:${FAIT_CONCURRENT}`, "Fait concurrent", jour(-2), SOURCE_ID.nvd]);

		const { rows: pidRows } = await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
		const bTravail = (async () => {
			await b.query("BEGIN");
			await b.query(INSERT_EVENT, [`kev:${FAIT_CONCURRENT}`, "Fait concurrent", jour(-1), SOURCE_ID.kev]);
			await b.query("COMMIT");
		})();

		let bloque = false;
		for (let i = 0; i < 2000 && !bloque; i++) bloque = await attendVerrou(pidRows[0]!.pid);
		assert.ok(bloque, "la seconde collecte attend le verrou du fait");

		await a.query("COMMIT");
		await bTravail;

		const flags = await drapeaux(FAIT_CONCURRENT);
		assert.deepEqual(flags, { kev: false, nvd: true }, "le plus ancien gagne, même si l'autre a commité en premier");
		assert.equal(Object.values(flags).filter(Boolean).length, 1, "exactement un signalement porte l'avantage");
	} finally {
		a.release();
		b.release();
		await nettoyage();
	}
});

test("critère de sortie : part de premiers rapports au-dessus de 40 %", async () => {
	try {
		await prepareSources();
		await insere("nvd", FAIT_A, jour(-4));
		await insere("kev", FAIT_A, jour(-2));
		await insere("certfr", FAIT_B, jour(-3));
		await insere("nvd", FAIT_B, jour(-1));
		await insere("certfr", FAIT_ISOLE, jour(-5));

		// Sur les faits de ce test : deux faits à deux sources et un fait isolé,
		// soit trois premiers rapports sur cinq signalements.
		const { rows: locaux } = await query<{ part: string }>(
			`SELECT round(100.0*count(*) FILTER (WHERE premier_rapport)/count(*),1) AS part
			   FROM event WHERE at > now()-interval '30 days' AND source_id = ANY($1)`,
			[SOURCES],
		);
		assert.equal(Number(locaux[0]!.part), 60, "3 premiers sur 5 signalements de test");

		// Critère de sortie, tel qu'il sera rejoué par le vérificateur.
		const { rows } = await query<{ part: string }>(
			`SELECT round(100.0*count(*) FILTER (WHERE premier_rapport)/count(*),1) AS part
			   FROM event WHERE at > now()-interval '30 days'`,
		);
		assert.ok(Number(rows[0]!.part) >= 40, `part de premiers rapports : ${rows[0]!.part} %`);
	} finally {
		await nettoyage();
	}
});
