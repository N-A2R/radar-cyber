/**
 * Vague 3 — sonde des sources muettes : fetch réel de chaque source, code HTTP,
 * taille, items décodables par le parser du format déclaré, date du dernier
 * item. La sonde ne conclut pas : elle produit la preuve que la classification
 * (motif) utilisera. Aucune source n'est modifiée ici.
 *
 *   DATABASE_URL=... tsx scripts/sonde-muettes.mts [sortie.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fetchResilient } from "../apps/api/src/collectors/http.js";
import { parseRssItems } from "../apps/api/src/collectors/parsers/xml.js";
import { parseJsonItems } from "../apps/api/src/collectors/parsers/json.js";
import { parseHtmlLinks } from "../apps/api/src/collectors/parsers/html.js";

const ENTREE = process.argv[2] ?? "/tmp/mission-tmp/source-health.json";
const SORTIE = process.argv[3] ?? "bench/results/sources-sonde-vague3.json";

type SourceRow = {
	id: string; name: string; family: string; url: string; kind: string; format: string;
	parser: Record<string, unknown>; enabled: boolean;
	last_ok_at: string | null; last_error_at: string | null; last_error: string | null;
};

const sante = JSON.parse(readFileSync(ENTREE, "utf8")) as {
	sources: { id: string; category: string; events_30d: number }[];
};
const ids = sante.sources.filter((s) => s.category === "muettes").map((s) => s.id);

/** Chargement des lignes source depuis la base. */
async function chargerSources(): Promise<SourceRow[]> {
	const { query } = await import("../apps/api/src/db.js");
	const r = await query(
		`SELECT id, name, family, url, kind::text, format, parser, enabled, last_ok_at, last_error_at, last_error
		 FROM source WHERE id = ANY($1)`, [ids],
	);
	return r.rows as unknown as SourceRow[];
}

/** Date du dernier item, copiée des valeurs reçues (jamais devinée). */
function dernierItem(items: Record<string, unknown>[]): string | null {
	let max: string | null = null;
	for (const it of items) {
		for (const cle of ["published", "pubDate", "pub_date", "date", "updated", "time", "created", "collected_at", "first_seen", "last_seen", "observed_at"]) {
			const v = it[cle];
			if (typeof v === "string" && /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}|GMT|UTC/.test(v)) {
				const d = new Date(v);
				if (!Number.isNaN(d.getTime()) && (!max || d > new Date(max))) max = d.toISOString();
			}
			if (typeof v === "number" && v > 10 ** 9 && v < 10 ** 11) {
				const d = new Date(v * 1000);
				if (!max || d > new Date(max)) max = d.toISOString();
			}
		}
	}
	return max;
}

const CONCURRENCE = 8;
async function pool<T>(travaux: (() => Promise<T>)[], n: number): Promise<T[]> {
	const out: T[] = [];
	let i = 0;
	async function ouvrier() {
		while (i < travaux.length) {
			const mon = i++;
			out[mon] = await travaux[mon]();
		}
	}
	await Promise.all(Array.from({ length: Math.min(n, travaux.length) }, ouvrier));
	return out;
}

async function sonder(s: SourceRow) {
	const debut = Date.now();
	const r = { id: s.id, name: s.name, family: s.family, url: s.url, kind: s.kind, format: s.format, enabled: s.enabled };
	try {
		const res = await fetchResilient(s.url, { timeoutMs: 20000, maxAttempts: 2 });
		const corps = res.text ?? "";
		const evidence: Record<string, unknown> = {
			...r,
			http: res.status,
			contentType: res.contentType ?? null,
			bytes: corps.length,
			ms: Date.now() - debut,
		};
		// Détection d'un blocage externe, copiée du corps reçu.
		if (res.status === 403 || res.status === 401 || res.status === 429 || res.status === 451) {
			evidence.blocage = `HTTP ${res.status}`;
		} else if (/Just a moment|cf-browser-verification|Attention Required|Cloudflare/i.test(corps.slice(0, 4000))) {
			evidence.blocage = "interstitiel Cloudflare dans le corps reçu";
		}
		// Tentative de décodage par le format déclaré.
		if (["rss", "atom"].includes(s.format)) {
			const items = parseRssItems(corps, (s.parser as { itemsPath?: string }).itemsPath);
			evidence.items = items.length;
			evidence.dernierItem = dernierItem(items);
			evidence.extrait = items[0] ? JSON.stringify(items[0]).slice(0, 200) : null;
		} else if (s.format === "json") {
			const items = parseJsonItems(corps, (s.parser as { itemsPath?: string }).itemsPath);
			evidence.items = items.length;
			evidence.dernierItem = dernierItem(items);
			evidence.extrait = items[0] ? JSON.stringify(items[0]).slice(0, 200) : null;
		} else if (["txt", "text"].includes(s.format)) {
			const lignes = corps.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith("#"));
			evidence.items = lignes.length;
			evidence.extrait = lignes[0]?.slice(0, 120) ?? null;
		} else if (s.format === "html") {
			const items = parseHtmlLinks(corps, s.url);
			evidence.items = items.length;
			evidence.dernierItem = dernierItem(items);
			evidence.extrait = /<title[^>]*>([\s\S]{0,160}?)/i.exec(corps)?.[1]?.trim() ?? null;
		} else {
			evidence.extrait = corps.slice(0, 120);
		}
		return evidence;
	} catch (e) {
		return { ...r, http: null, erreur: String(e).slice(0, 250), ms: Date.now() - debut };
	}
}

async function main(): Promise<void> {
	const sources = await chargerSources();
	console.log(`${sources.length} source(s) muette(s) à sonder`);
	const preuves = await pool(sources.map((s) => () => sonder(s)), CONCURRENCE);
	const sortie = {
		dateMesure: new Date().toISOString(),
		entree: ENTREE,
		method: "fetchResilient (client des collecteurs) + parsers du dépôt ; preuve par source : HTTP, octets, items décodables, dernier item copié, extrait verbatim",
		sondes: preuves,
	};
	writeFileSync(SORTIE, `${JSON.stringify(sortie, null, 2)}\n`, "utf8");
	console.log(`publié : ${SORTIE}`);
	const { closePools } = await import("../apps/api/src/db.js");
	await closePools();
}

main().catch((e) => { console.error(e); process.exit(1); });
