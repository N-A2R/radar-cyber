/**
 * Non-régression planification (18 sources du bench jamais collectées).
 *
 * Deux faits sont prouvés :
 *   1. après un cycle, aucune des 18 sources "jamais vues" n'est restée sans
 *      `collector_run` : l'ancien sélecteur les parcourait bien, mais dans
 *      l'ordre des ids, sans priorité ni journal des évictions ;
 *   2. les motifs d'éviction sont désormais explicites et journalisés (avant,
 *      une source désactivée, en quarantaine ou dédiée disparaissait
 *      silencieusement, tout comme une source encore dans son intervalle).
 *
 * Isolation : serveur RSS local + sources/collector_run/event jetables,
 * préfixées aléatoirement, supprimées dans `after`. Aucun réseau externe.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { closePools, query } from "../src/db.js";
import {
	runGenericSources,
	selectCycleSources,
	type CycleSourceRow,
} from "../src/collectors/generic.js";
import { dedicatedSourceIds } from "../src/collectors/index.js";

const PREFIX = `cp${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const NEW_COUNT = 18;
/** `-z…` : lexicographiquement APRÈS la source déjà collectée `-a…`. */
const NEW_IDS = Array.from({ length: NEW_COUNT }, (_, i) =>
	`${PREFIX}-z${String(i).padStart(2, "0")}`,
);
/** Déjà collectée, mais hors délai : elle reste éligible, après les 18. */
const OLD_ID = `${PREFIX}-a-ancienne`;
/** Collectée à l'instant : elle doit être évincée (interval_not_elapsed). */
const RECENT_ID = `${PREFIX}-d-recente`;
const DISABLED_ID = `${PREFIX}-b-desactivee`;
const QUARANTINE_ID = `${PREFIX}-c-quarantine`;
/** `cert_fr` est déjà semé dans la base de test : on ne le supprime pas. */
const DEDICATED_ID = dedicatedSourceIds[0];

const ALL_IDS = [
	...NEW_IDS,
	OLD_ID,
	RECENT_ID,
	DISABLED_ID,
	QUARANTINE_ID,
	DEDICATED_ID,
];
const insertedIds: string[] = [];
let localServer: Server | null = null;

function feedXml(feedUrl: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Planification — flux cyber de test</title>
<link>${feedUrl}</link>
<description>Deux items cyber déterministes pour la non-régression</description>
<item>
<title>${PREFIX} — Campagne de phishing ciblant des collectivités de Nouvelle-Aquitaine</title>
<link>${feedUrl}?item=1&amp;p=${PREFIX}</link>
<guid isPermaLink="false">${PREFIX}-item-1</guid>
<pubDate>Thu, 19 Nov 2026 08:00:00 GMT</pubDate>
<description>Campagne de phishing observée contre des collectivités de Nouvelle-Aquitaine ; indicateurs CVE-2026-12345 et domaine phishing-exemple.test.</description>
</item>
<item>
<title>${PREFIX} — Vulnérabilité critique CVE-2026-54321 exploitée</title>
<link>${feedUrl}?item=2&amp;p=${PREFIX}</link>
<guid isPermaLink="false">${PREFIX}-item-2</guid>
<pubDate>Fri, 20 Nov 2026 09:30:00 GMT</pubDate>
<description>Exploitation active de CVE-2026-54321 sur des serveurs web ; correctif disponible, redistribution limitée.</description>
</item>
</channel></rss>`;
}

function fakeRow(id: string, overrides: Partial<CycleSourceRow> = {}): CycleSourceRow {
	return {
		id,
		name: `${id} (test)`,
		family: "cti",
		url: "http://127.0.0.1/feed.xml",
		kind: "narrative",
		format: "rss",
		parser: {},
		interval_sec: 3600,
		last_ok_at: null,
		last_error_at: null,
		relevance: "context",
		enabled: true,
		derniere_collecte: null,
		...overrides,
	};
}

test("planification : jamais collectées en tête, évictions motivées et journalisées", async (t) => {
	const server = createServer((_req, res) => {
		const addr = server.address();
		const port = addr !== null && typeof addr === "object" ? addr.port : 0;
		res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
		res.end(feedXml(`http://127.0.0.1:${port}/feed.xml`));
	});
	localServer = server;
	const { promise: listening, resolve: onListening } = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", onListening);
	await listening;
	const addr = server.address();
	assert.ok(addr !== null && typeof addr === "object", "serveur RSS local démarré");
	const feedUrl = `http://127.0.0.1:${addr.port}/feed.xml`;

	const nowMs = Date.now();
	const fourHoursAgo = new Date(nowMs - 4 * 3600_000);
	const justNow = new Date(nowMs);

	const seed = await query<{ id: string }>("SELECT id FROM source WHERE id = $1", [DEDICATED_ID]);
	const dedicatedPreexisting = seed.rows.length > 0;

	for (const id of [...NEW_IDS, OLD_ID, RECENT_ID, DISABLED_ID, QUARANTINE_ID]) {
		const enabled = id !== DISABLED_ID;
		const kind = id === QUARANTINE_ID ? "quarantine" : "narrative";
		await query(
			`INSERT INTO source (id, name, family, url, kind, format, parser, interval_sec, relevance, enabled)
			 VALUES ($1, $2, 'cti', $3, $4, 'rss', '{}'::jsonb, 3600, 'context', $5)`,
			[id, `${id} (test)`, feedUrl, kind, enabled],
		);
		insertedIds.push(id);
	}
	if (!dedicatedPreexisting) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, format, parser, interval_sec, relevance, enabled)
			 VALUES ($1, $2, 'cti', $3, 'narrative', 'rss', '{}'::jsonb, 3600, 'context', true)`,
			[DEDICATED_ID, `${DEDICATED_ID} (test)`, feedUrl],
		);
		insertedIds.push(DEDICATED_ID);
	}

	for (const [id, finishedAt] of [[OLD_ID, fourHoursAgo], [RECENT_ID, justNow]] as const) {
		await query(
			`INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new)
			 VALUES ($1, $2, 'ok', 0, 0)`,
			[id, finishedAt],
		);
	}

	// --- Sélection pure : priorité aux 18 jamais collectées, motifs explicites.
	const rows: CycleSourceRow[] = ALL_IDS.map((id) => {
		if (id === DISABLED_ID) return fakeRow(id, { enabled: false });
		if (id === QUARANTINE_ID) return fakeRow(id, { kind: "quarantine" });
		if (id === OLD_ID) return fakeRow(id, { derniere_collecte: fourHoursAgo });
		if (id === RECENT_ID) return fakeRow(id, { derniere_collecte: justNow });
		return fakeRow(id);
	});
	const { selected, excluded } = selectCycleSources(rows, nowMs);
	const selectedIds = selected.map((r) => r.id);
	const newPositions = NEW_IDS.map((id) => selectedIds.indexOf(id));
	assert.ok(
		newPositions.every((pos) => pos >= 0),
		"les 18 sources jamais collectées doivent toutes être sélectionnées",
	);
	const oldPosition = selectedIds.indexOf(OLD_ID);
	assert.ok(oldPosition >= 0, "la source déjà collectée mais hors délai reste éligible");
	assert.ok(
		Math.max(...newPositions) < oldPosition,
		"les 18 jamais collectées passent avant la source déjà collectée (id pourtant antérieur)",
	);
	for (const id of [DISABLED_ID, QUARANTINE_ID, DEDICATED_ID, RECENT_ID]) {
		assert.ok(!selectedIds.includes(id), `${id} ne doit pas être sélectionnée`);
	}

	const motifs = new Map(excluded.map((e) => [e.id, e]));
	assert.equal(motifs.get(DISABLED_ID)?.reason, "disabled");
	assert.equal(motifs.get(QUARANTINE_ID)?.reason, "quarantine_kind");
	assert.equal(motifs.get(DEDICATED_ID)?.reason, "dedicated_collector");
	assert.equal(motifs.get(RECENT_ID)?.reason, "interval_not_elapsed");
	for (const e of excluded) {
		assert.ok(e.detail.trim().length > 0, `détail lisible attendu pour ${e.id}`);
	}

	// --- Cycle réel sur les 18 : preuve SQL demandée.
	const logs: string[] = [];
	const log = (msg: string): void => { logs.push(msg); };
	const { rows: avantCycle } = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM source s
		 WHERE s.id = ANY($1)
		   AND NOT EXISTS (SELECT 1 FROM collector_run r WHERE r.source_id = s.id)`,
		[NEW_IDS],
	);
	const jamaisAvant = Number(avantCycle[0]?.n ?? -1);
	await runGenericSources(log, { sourceIds: NEW_IDS, limit: NEW_COUNT });

	const { rows: sansRun } = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM source s
		 WHERE s.id = ANY($1)
		   AND NOT EXISTS (SELECT 1 FROM collector_run r WHERE r.source_id = s.id)`,
		[NEW_IDS],
	);
	const jamaisApres = Number(sansRun[0]?.n ?? -1);
	t.diagnostic(`jamais collectées : ${jamaisAvant} -> ${jamaisApres}`);
	assert.equal(
		jamaisApres,
		0,
		"après le cycle, aucune des 18 sources n'est restée sans collector_run",
	);

	// --- Les évictions sont journalisées (2e passage incluant les motifs).
	await runGenericSources(log, { sourceIds: ALL_IDS, limit: ALL_IDS.length });
	assert.ok(
		logs.some((l) => /\[planification\] source \S+ écartée : .+ \([a-z_]+\)/.test(l)),
		`ligne d'éviction [planification] attendue dans les logs : ${logs.join(" | ").slice(0, 800)}`,
	);
	assert.ok(
		logs.some((l) => l.includes(`[planification] source ${RECENT_ID} écartée :`)),
		"l'éviction pour délai non écoulé doit être journalisée avec son id",
	);
});

after(async () => {
	if (localServer) {
		const { promise: closed, resolve: onClose, reject: onCloseError } = Promise.withResolvers<void>();
		localServer!.close((err) => (err ? onCloseError(err) : onClose()));
		await closed;
		localServer = null;
	}
	await query("DELETE FROM event WHERE source_id = ANY($1)", [ALL_IDS]).catch(() => {});
	await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [ALL_IDS]).catch(() => {});
	await query("DELETE FROM source WHERE id = ANY($1)", [insertedIds]).catch(() => {});
	await closePools();
});
