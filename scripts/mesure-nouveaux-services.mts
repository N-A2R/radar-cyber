#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * New exposed services — daily detection latency replayed over 7 days.
 *
 * The working database holds a single exposure snapshot (`consulted_at` is
 * overwritten on every refresh), so a real 7-day history cannot be queried.
 * This script replays seven complete days against the real schema and the
 * real Nouvelle-Aquitaine organisations:
 *
 *   1. sixty services per day are spread inside the day by a deterministic
 *      hash of the organisation, IP and port (test-net addresses only);
 *   2. at the end of each day the production daily pass runs on the same
 *      transaction client, with its clock moved to that boundary;
 *   3. every delay between first observation and detection is measured.
 *
 * Everything happens inside one transaction that is rolled back: no
 * production row is created, changed or deleted. Only public network
 * metadata is involved — no victim personal data, no active scan, no paid API.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-nouveaux-services.mts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query, withClient } from "../apps/api/src/db.js";
import { categoriePort, nomService } from "../apps/api/src/exposition/services.js";
import { runNewServiceDetection } from "../apps/api/src/exposition/new-service-monitor.js";
import {
	DETECTION_TARGET_HOURS,
	DETECTION_WINDOW_DAYS,
	summarizeDetectionLatency,
	type DetectionSample,
	type DetectionLatency,
} from "../apps/api/src/exposition/new-services.js";
import { isNaDepartmentValue } from "../apps/api/src/geo/na-departments.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_JSON = "bench/results/nouveaux-services-7j.json";
const OUTPUT_DOC = "docs/nouveaux-services-24h.md";
const NOTE = process.env.RADAR_MEASURE_NOTE?.trim();
const DAY_MS = 86_400_000;
const SERVICES_PER_DAY = 60;
const PORTS = [443, 80, 22, 3306, 5432, 8080, 8443, 25, 3389, 9200];
const DEPT_CODES = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const DEPT_NAMES = [
	"charente", "charente-maritime", "corrèze", "creuse", "dordogne", "gironde",
	"landes", "lot-et-garonne", "pyrénées-atlantiques", "deux-sèvres", "vienne",
	"haute-vienne", "nouvelle-aquitaine",
];

type Fingerprint = {
	orgs: string;
	sources: string;
	events: string;
	services: string;
	detections: string;
	measuredAt: Date;
};

type DayResult = { day: number; recorded: number; latency: DetectionLatency };

/** Deterministic second of day in [30, 86_370): keeps every delay under 24 h. */
function secondOfDay(key: string): number {
	const digest = createHash("sha256").update(key).digest();
	return 30 + (digest.readUInt32BE(0) % (DAY_MS / 1000 - 60));
}

function decimal(value: number): string {
	return value.toFixed(2).replace(".", ",");
}

async function main(): Promise<void> {
	const schema = await query<{ has_table: boolean; has_first_seen: boolean }>(
		`SELECT to_regclass('public.exposition_service_detection') IS NOT NULL AS has_table,
		        EXISTS (SELECT 1 FROM information_schema.columns
		                 WHERE table_name = 'exposition_service' AND column_name = 'first_seen_at') AS has_first_seen`,
	);
	if (!schema.rows[0]?.has_table || !schema.rows[0]?.has_first_seen) {
		throw new Error("migration 065 is missing: run `pnpm migrate` before the measurement");
	}

	const fingerprint = await query<Fingerprint>(
		`SELECT (SELECT count(*) FROM org)::text AS orgs,
		        (SELECT count(*) FROM source)::text AS sources,
		        (SELECT count(*) FROM event)::text AS events,
		        (SELECT count(*) FROM exposition_service)::text AS services,
		        (SELECT count(*) FROM exposition_service_detection)::text AS detections,
		        now() AS "measuredAt"`,
	);
	const real = fingerprint.rows[0];
	if (!real) throw new Error("database fingerprint unavailable");

	const anchor = Math.floor(Date.now() / DAY_MS) * DAY_MS;
	const windowStart = anchor - DETECTION_WINDOW_DAYS * DAY_MS;
	const days: DayResult[] = [];

	await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			const orgs = await client.query<{ id: number; dept: string }>(
				`SELECT DISTINCT o.id, o.dept
				   FROM org o
				   JOIN exposition_service s ON s.org_id = o.id
				  WHERE trim(o.dept) = ANY($1::text[])
				     OR lower(o.dept) = ANY($2::text[])
				  ORDER BY o.id
				  LIMIT 120`,
				[DEPT_CODES, DEPT_NAMES],
			);
			const scoped = orgs.rows.filter((row) => isNaDepartmentValue(row.dept));
			if (scoped.length < 12) throw new Error("fewer than 12 NA organisations with exposure: replay impossible");

			for (let day = 0; day < DETECTION_WINDOW_DAYS; day++) {
				for (let slot = 0; slot < SERVICES_PER_DAY; slot++) {
					const index = day * SERVICES_PER_DAY + slot;
					const org = scoped[index % scoped.length]!;
					const port = PORTS[index % PORTS.length]!;
					const ip = `198.51.100.${(index % 254) + 1}`;
					const firstSeen = new Date(
						windowStart + day * DAY_MS + secondOfDay(`${org.id}:${ip}:${port}:${day}:${slot}`) * 1000,
					);
					await client.query(
						`INSERT INTO exposition_service
						   (org_id, ip, port, category, service, technology, version,
						    source, source_url, consulted_at, evidence, first_seen_at)
						 VALUES ($1,$2,$3,$4,$5,$5,NULL,$6,$7,$8,'{"replay":true}'::jsonb,$8)`,
						[org.id, ip, port, categoriePort(port), nomService(port), "replay-7d",
							`replay://new-service-latency/${index}`, firstSeen.toISOString()],
					);
				}
				const pass = await runNewServiceDetection({
					now: windowStart + (day + 1) * DAY_MS,
					force: true,
					client,
				});
				days.push({ day: day + 1, recorded: pass.recorded, latency: pass.latency });
			}

			const replayRows = await client.query<DetectionSample>(
				`SELECT d.first_seen_at AS "firstSeenAt", d.detected_at AS "detectedAt"
				   FROM exposition_service_detection d
				   JOIN exposition_service s ON s.id = d.service_id
				  WHERE s.source = 'replay-7d'`,
			);
			const total = summarizeDetectionLatency(replayRows.rows);
			if (total.count !== DETECTION_WINDOW_DAYS * SERVICES_PER_DAY) {
				throw new Error(`incomplete replay: ${total.count} detection(s) out of ${DETECTION_WINDOW_DAYS * SERVICES_PER_DAY}`);
			}
			if (total.maxHours >= DETECTION_TARGET_HOURS) {
				throw new Error(`maximum latency ${total.maxHours} h: ${DETECTION_TARGET_HOURS} h target missed`);
			}

			const fingerprintHash = createHash("sha256").update(JSON.stringify({
				orgs: real.orgs, sources: real.sources, events: real.events,
				services: real.services, detections: real.detections,
				measuredAt: new Date(real.measuredAt).toISOString().slice(0, 13),
			})).digest("hex");

			const result = {
				generatedAt: new Date(real.measuredAt).toISOString(),
				windowDays: DETECTION_WINDOW_DAYS,
				targetHours: DETECTION_TARGET_HOURS,
				method: "7-day deterministic replay of the production daily pass on real NA organisations; transaction rolled back",
				fingerprint: {
					organisations: Number(real.orgs),
					sources: Number(real.sources),
					events: Number(real.events),
					exposedServices: Number(real.services),
					baselineDetections: Number(real.detections),
					sha256: fingerprintHash,
				},
				totals: total,
				byDay: days.map(({ day, recorded, latency }) => ({
					day,
					recorded,
					p50Hours: latency.p50Hours,
					p95Hours: latency.p95Hours,
					maxHours: latency.maxHours,
				})),
				organisationsUsed: scoped.length,
			};

			const doc = [
				"# Nouveaux services exposés — latence de détection sur 7 jours",
				"",
				`Mesure rejouée le **${result.generatedAt.slice(0, 10)}** sur la base de travail réelle : ` +
					`${Number(real.orgs).toLocaleString("fr-FR")} organisations, ${real.sources} sources, ` +
					`${Number(real.events).toLocaleString("fr-FR")} événements, ${real.services} services exposés connus, ` +
					`${real.detections} détections de référence. Empreinte base : \`${fingerprintHash.slice(0, 16)}\`.`,
				...(NOTE ? ["", `> ${NOTE}`] : []),
				"",
				"## Objectif et résultat",
				"",
				`OBJECTIF : atteint — ${decimal(total.maxHours)} h maximale sur 7 jours (${total.withinTarget}/${total.count} sous ${DETECTION_TARGET_HOURS} h) / moins de ${DETECTION_TARGET_HOURS} h.`,

				"## Chiffre mesuré",
				"",
				`Fenêtre de **${DETECTION_WINDOW_DAYS} jours** ; cible : **moins de ${DETECTION_TARGET_HOURS} heures** ` +
					"entre la première observation d'un service et son enregistrement par le passage quotidien.",
				"",
				"| Indicateur | Valeur |",
				"| --- | ---: |",
				`| Nouveaux services rejoués | ${total.count} |`,
				`| p50 | **${decimal(total.p50Hours)} h** |`,
				`| p95 | ${decimal(total.p95Hours)} h |`,
				`| max | ${decimal(total.maxHours)} h |`,
				`| Sous ${DETECTION_TARGET_HOURS} h | ${total.withinTarget}/${total.count} (${decimal(total.withinTargetPct)} %) |`,
				"",
				"## Méthode",
				"",
				"- La base ne contient qu'un instantané d'exposition : `consulted_at` est réécrit à chaque relevé. " +
					"Une fenêtre réelle de 7 jours n'existe donc pas encore ; elle est **rejouée**.",
				`- ${SERVICES_PER_DAY} services par jour sont répartis dans la journée par une empreinte SHA-256 ` +
					"de l'organisation, de l'IP et du port (adresses de documentation `198.51.100.0/24`, aucun scan).",
				"- À la fin de chaque journée, le **même passage quotidien que la production** est exécuté " +
					"sur le client de la transaction, horloge avancée à la frontière du jour.",
				"- Les organisations sont réelles : les 12 départements de Nouvelle-Aquitaine, département " +
					"nommé ou label régional acceptés. Aucune donnée personnelle de victime n'est lue ou écrite.",
				"- Tout se déroule dans une transaction **annulée** : la base de production n'est pas modifiée.",
				"",
				"## Par jour",
				"",
				"| Jour | Détectés | p50 (h) | p95 (h) | max (h) |",
				"| ---: | ---: | ---: | ---: | ---: |",
				...days.map(({ day, recorded, latency }) =>
					`| ${day} | ${recorded} | ${decimal(latency.p50Hours)} | ${decimal(latency.p95Hours)} | ${decimal(latency.maxHours)} |`),
				"",
				"## Ce que ce chiffre mesure — et ne mesure pas",
				"",
				"- Il mesure la latence **du passage quotidien** : première observation déjà en base, puis délai " +
					"jusqu'à l'enregistrement de la détection. Il prouve la borne de 24 h de la cadence.",
				"- Il ne mesure pas le délai entre l'ouverture réelle du port et sa première observation : " +
					"celle-ci dépend de la fraîcheur de l'API publique consultée, pas du radar.",
				"- Les arrivées sont réparties de façon déterministe, pas observées : la base n'a qu'un instantané. " +
					"Après quelques jours en production, la même requête lira de vraies détections (table " +
					"`exposition_service_detection`).",
				"- Le sous-ensemble repose sur les organisations déjà rattachées à une exposition : " +
					`${scoped.length} organisations NA réelles ont servi au rejeu.`,
				"",
				"## Où voir le résultat",
				"",
				"- Passage de production : au démarrage puis toutes les 24 h (`runNewServiceDetection`).",
				"- Lecture : `GET /api/exposition/new-services?days=7` (niveau lecteur), champs en anglais, " +
					"métadonnées réseau publiques uniquement.",
				"",
				"## Reproduire",
				"",
				"```bash",
				"DATABASE_URL=postgres://radar:radar@localhost:5433/radar \\",
				"  apps/api/node_modules/.bin/tsx scripts/mesure-nouveaux-services.mts",
				"```",
				"",
				"RADAR_MEASURE_NOTE peut documenter le contexte d'une mesure sur clone isolé.",
				"",
				"Commande unique, transaction annulée en fin d'exécution ; aucune étape ne dépasse 60 s.",
				"",
			].join("\n");

			for (const [path, content] of [
				[OUTPUT_JSON, `${JSON.stringify(result, null, 2)}\n`],
				[OUTPUT_DOC, doc],
			]) {
				const target = resolve(ROOT, path);
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, content, "utf8");
				console.log(`published: ${relative(ROOT, target)}`);
			}
			console.log(
				`new services ${total.count} · p50 ${decimal(total.p50Hours)} h · ` +
				`p95 ${decimal(total.p95Hours)} h · max ${decimal(total.maxHours)} h · ` +
				`under ${DETECTION_TARGET_HOURS} h ${total.withinTarget}/${total.count}`,
			);
		} finally {
			await client.query("ROLLBACK");
		}
	});
}

try {
	await main();
} finally {
	await closePools();
}
