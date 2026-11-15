#!/usr/bin/env -S pnpm -F @radar/api exec tsx
/**
 * Import des entreprises de Nouvelle-Aquitaine (recherche-entreprises.api.gouv.fr).
 *
 * L'API plafonne `per_page` à 25 : une requête par tranche de 25 entreprises.
 * Un import complet des 12 départements × 8 codes NAF demanderait des heures,
 * d'où trois bornes assumées :
 *   - seuls les codes NAF les plus directement liés au numérique ;
 *   - `MAX_PAGES` pages par couple (département, NAF) ;
 *   - insertion page par page, pour que le travail déjà fait survive à un arrêt.
 *
 * Usage :
 *   pnpm -F @radar/api exec tsx ../../scripts/import-entreprises-na.mts [--apply] [--pages=N]
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");
import { secteurDeNaf } from "./naf-secteurs.mts";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const API = "https://recherche-entreprises.api.gouv.fr/search";
const UA = "radar-cyber/1.0 (observatoire Nouvelle-Aquitaine)";
const PER_PAGE = 25;

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
/** Numérique et télécoms : c'est là que se trouvent les entreprises à cybersécurité. */
const NAF = ["6202A", "6201Z", "6209Z", "6203Z"];
/**
 * Secteurs hors numérique, ajoutés le 14 novembre 2026.
 *
 * La mesure de couverture désignait ce trou : 13 035 entreprises en base,
 * toutes ou presque en numérique, et **zéro** en agroalimentaire, industrie,
 * BTP et commerce — les secteurs les plus rançonnés de la région. Un incident
 * visant une enseigne de distribution ou un industriel ne pouvait donc pas
 * être rattaché, quelle que soit la qualité du moteur.
 *
 * Le choix des codes reste indépendant du corpus : on prend les activités
 * dominantes de chaque famille, pas les victimes déjà connues.
 */
const NAF_HORS_NUMERIQUE = [
	"4711B", // supermarchés
	"4711F", // hypermarchés
	"4711D", // supérettes
	"4631Z", // commerce de gros de fruits et légumes
	"1013A", // transformation et conservation de viande
	"2562B", // usinage
	"4120A", // construction de maisons individuelles
];
const NAF_TOUS = [...NAF, ...NAF_HORS_NUMERIQUE];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pagesArg = args.find((a) => a.startsWith("--pages="));
const MAX_PAGES = pagesArg ? Math.max(1, Number(pagesArg.slice(8)) || 20) : 20;
const CONCURRENCY = 4;
const PAUSE_MS = 220;

type Row = {
  siren?: string;
  nom_complet?: string;
  activite_principale?: string;
  siege?: { departement?: string; libelle_commune?: string; site_web?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slugify(name: string, siren: string): string {
	return `${name
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48)}-${siren}`;
}

function domainOf(url: string | undefined): string | null {
	if (!url) return null;
	const raw = url.trim().toLowerCase();
	if (!raw) return null;
	const withoutScheme = raw.replace(/^[a-z]+:\/\//, "");
	const host = withoutScheme.split("/")[0].replace(/^www\./, "");
	return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

/** L'API attend le format INSEE ponctué : `6202A` → `62.02A` (400 sinon). */
function toApiNaf(code: string): string {
	const raw = code.replace(".", "").toUpperCase();
	return raw.length >= 5 ? `${raw.slice(0, 2)}.${raw.slice(2)}` : code;
}

async function fetchPage(dept: string, naf: string, page: number): Promise<{ rows: Row[]; total: number }> {
	const url = `${API}?departement=${dept}&activite_principale=${encodeURIComponent(toApiNaf(naf))}&per_page=${PER_PAGE}&page=${page}`;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch(url, { headers: { "User-Agent": UA } });
			if (res.status === 429 || res.status >= 500) {
				await sleep(1000 * (attempt + 1));
				continue;
			}
			if (!res.ok) {
				console.error(`  HTTP ${res.status} pour dept=${dept} naf=${naf} page=${page}`);
				return { rows: [], total: 0 };
			}
			const body = (await res.json()) as { results?: Row[]; total_results?: number };
			return { rows: body.results ?? [], total: body.total_results ?? 0 };
		} catch {
			await sleep(1000 * (attempt + 1));
		}
	}
	return { rows: [], total: 0 };
}

async function importPair(client: InstanceType<typeof Client>, dept: string, naf: string): Promise<number> {
	let inserted = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { rows } = await fetchPage(dept, naf, page);
		if (rows.length === 0) break;
		for (const row of rows) {
			const siren = (row.siren ?? "").trim();
			const name = (row.nom_complet ?? "").trim();
			if (!siren || !name) continue;
			const siege = row.siege ?? {};
			const res = await client.query(
				`INSERT INTO org (name, slug, kind, sector, naf, dept, city, domain, status, siren)
				 VALUES ($1,$2,'entreprise',$8,$3,$4,$5,$6,'confirme',$7)
				 ON CONFLICT (siren) WHERE siren IS NOT NULL DO NOTHING`,
				[
					name.slice(0, 200),
					slugify(name, siren),
					(row.activite_principale ?? naf).slice(0, 10),
					siege.departement ?? dept,
					siege.libelle_commune ? siege.libelle_commune.slice(0, 120) : null,
					domainOf(siege.site_web),
					siren,
					secteurDeNaf(row.activite_principale ?? naf),
				],
			);
			inserted += res.rowCount ?? 0;
		}
		await sleep(PAUSE_MS);
	}
	return inserted;
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	const before = Number((await client.query("SELECT count(*)::text AS c FROM org")).rows[0].c);

	const pairs: [string, string][] = [];
	for (const dept of DEPTS) for (const naf of NAF_TOUS) pairs.push([dept, naf]);

	let done = 0;
	let inserted = 0;
	const queue = [...pairs];

	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (;;) {
				const pair = queue.shift();
				if (!pair) return;
				const [dept, naf] = pair;
				const n = apply ? await importPair(client, dept, naf) : 0;
				inserted += n;
				done++;
				if (done % 4 === 0 || done === pairs.length) {
					console.log(`${done}/${pairs.length} couples — ${inserted} entreprise(s) insérée(s)`);
				}
			}
		}),
	);

	const after = Number((await client.query("SELECT count(*)::text AS c FROM org")).rows[0].c);
	console.log(`org : ${before} → ${after} (${after - before} ajoutée(s))`);
	await client.end();
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
