/**
 * Causes réelles du silence des sources rouges : sonde HTTP réelle, une fois
 * par source de l'échantillon, avec classification fondée sur la réponse.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/probe-red-sources.mts
 *
 * lecture seule sur la base ; aucune écriture ailleurs que le fichier JSON.
 * Les URL .onion passent par le proxy SOCKS de Tor (RADAR_TOR_SOCKS), comme le
 * collecteur ; timeout identique de 10 s pour tous les transports.
 */
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { query, closePools } from "../apps/api/src/db.js";
import { decodeBody } from "../apps/api/src/collectors/parsers/decode.js";
import { detectItems, type DetectionStrategy } from "../apps/api/src/collectors/generic.js";


type Cause = "disparue" | "bloquée" | "serveur" | "timeout" | "contenu non parsable" | "flux vide" | "autre";

const CAUSES: Cause[] = ["disparue", "bloquée", "serveur", "timeout", "contenu non parsable", "flux vide", "autre"];

interface RedSource {
	id: string;
	name: string;
	url: string;
	format: string;
	kind: string;
	enabled: boolean;
}

interface Probe {
	status: number | null;
	elapsed_ms: number;
	bytes: number;
	truncated: boolean;
	text: string;
	content_type: string | null;
	error: string | null;
	transport: "direct" | "tor";
	final_url: string;
}

interface Classification {
	cause: Cause;
	detail: string;
	items_detectes: number;
	strategie_detection: DetectionStrategy | null;
}

interface Entry {
	id: string;
	name: string;
	url: string;
	format: string;
	code_http: number | null;
	temps_ms: number;
	taille_octets: number;
	cause: Cause;
	extrait: string;
	detail: string;
	items_detectes: number;
	strategie_detection: DetectionStrategy | null;
	transport: "direct" | "tor";
	url_finale: string;
	corps_tronque: boolean;
	fetch_realise: boolean;
}

const DATABASE = "postgres://radar:radar@localhost:5433/radar (lecture seule, SELECT uniquement)";
const SEED = 20261121;
const SAMPLE_SIZE = 40;
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PARSE_CHARS = MAX_BODY_BYTES + 1;
const CONCURRENCY = 4;
const USER_AGENT = "radar-cyber-red-sources-probe/1.0 (+ops@radar-cyber.local)";
const OUTPUT = "bench/results/causes-sources.json";

const TOR_SOCKS = process.env.RADAR_TOR_SOCKS?.trim() || null;
const requireFromApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
// Imported at runtime from the api workspace so the probe uses exactly the
// same SOCKS agent as the collector, without adding a root-level dependency.
const SocksProxyAgent = requireFromApi("socks-proxy-agent").SocksProxyAgent as new (url: string) => unknown;
// XMLValidator resolves from the api workspace, which owns the dependency.
const { XMLValidator } = requireFromApi("fast-xml-parser") as {
	XMLValidator: { validate: (xml: string) => true | { err: { msg: string } } };
};

const RED_SQL = `
WITH dernier_fait AS (
  SELECT source_id, max(COALESCE(observed_at, collected_at)) AS dernier
  FROM event GROUP BY 1
)
SELECT s.id, s.name, s.url, s.format, s.kind, s.enabled
FROM source s LEFT JOIN dernier_fait d ON d.source_id = s.id
WHERE d.dernier IS NULL OR d.dernier < now() - interval '7 days'
ORDER BY s.id
`;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOnion(url: string): boolean {
	try {
		return new URL(url).hostname.toLowerCase().replace(/\.$/, "").endsWith(".onion");
	} catch {
		return false;
	}
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		const cause = error.cause;
		let code = "";
		if (cause !== null && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
			code = `${cause.code}: `;
		}
		return `${error.name === "AbortError" ? "AbortError" : code + error.name}: ${error.message}`.slice(0, 200);
	}
	return String(error).slice(0, 200);
}

function isTimeout(error: string | null): boolean {
	return error !== null && /AbortError|TimeoutError|ETIMEDOUT|délai dépassé|timeout/i.test(error);
}

function excerpt(text: string, error: string | null): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length > 0) return clean.slice(0, 100);
	return (error ?? "").replace(/\s+/g, " ").slice(0, 100);
}

/** PRNG deterministe : l'echantillon est tiré au hasard mais reproductible. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sampleRandom<T>(rows: T[], count: number, seed: number): T[] {
	const out = [...rows];
	const rand = mulberry32(seed);
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out.slice(0, count);
}

function collect(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<{ chunks: Buffer[]; bytes: number; truncated: boolean }> {
	const chunks: Buffer[] = [];
	let bytes = 0;
	let truncated = false;
	const loop = async (): Promise<void> => {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			bytes += value.byteLength;
			if (bytes <= MAX_BODY_BYTES) chunks.push(Buffer.from(value));
			else {
				truncated = true;
				await reader.cancel();
				return;
			}
		}
	};
	return loop().then(() => ({ chunks, bytes, truncated }));
}

async function probeDirect(url: string): Promise<Probe> {
	const started = Date.now();
	let status: number | null = null;
	let content_type: string | null = null;
	let bytes = 0;
	let truncated = false;
	let chunks: Buffer[] = [];
	let error: string | null = null;
	let final_url = url;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers: { "user-agent": USER_AGENT, accept: "*/*" },
			signal: controller.signal,
			cache: "no-store",
		});
		status = res.status;
		content_type = res.headers.get("content-type");
		final_url = res.url || url;
		if (res.body) {
			const got = await collect(res.body.getReader());
			chunks = got.chunks;
			bytes = got.bytes;
			truncated = got.truncated;
		}
	} catch (err) {
		error = describeError(err);
	} finally {
		clearTimeout(timer);
	}
	const text = chunks.length > 0 ? decodeBody(Buffer.concat(chunks), content_type).text : "";
	return { status, elapsed_ms: Date.now() - started, bytes, truncated, text, content_type, error, transport: "direct", final_url };
}

/** GET via Tor pour les .onion, avec redirections manuelles et même budget 10 s. */
function probeTor(url: string): Promise<Probe> {
	const started = Date.now();
	const socks = TOR_SOCKS;
	if (!socks) {
		return Promise.resolve({
			status: null, elapsed_ms: 0, bytes: 0, truncated: false, text: "", content_type: null,
			error: "RADAR_TOR_SOCKS absent : .onion non joignable", transport: "tor", final_url: url,
		});
	}
	const agent = new SocksProxyAgent(socks);

	function hop(target: string, redirects: number): Promise<{ status: number; chunks: Buffer[]; bytes: number; truncated: boolean; content_type: string | null; final_url: string }> {
		return new Promise((resolve, reject) => {
			const u = new URL(target);
			const send = u.protocol === "https:" ? httpsRequest : httpRequest;
			const req = send(
				{
					protocol: u.protocol,
					hostname: u.hostname,
					port: u.port || (u.protocol === "https:" ? 443 : 80),
					path: `${u.pathname}${u.search}`,
					method: "GET",
					headers: { host: u.host, "user-agent": USER_AGENT, accept: "*/*" },
					agent: agent as never,
					timeout: Math.max(1, TIMEOUT_MS - (Date.now() - started)),
				},
				(res) => {
					const status = res.statusCode ?? 0;
					const location = res.headers.location;
					if (status >= 300 && status < 400 && location && redirects < 3) {
						res.resume();
						hop(new URL(location, u).toString(), redirects + 1).then(resolve, reject);
						return;
					}
					const chunks: Buffer[] = [];
					let bytes = 0;
					let truncated = false;
					res.on("data", (chunk: Buffer) => {
						bytes += chunk.length;
						if (bytes <= MAX_BODY_BYTES) chunks.push(chunk);
						else {
							truncated = true;
							res.destroy();
						}
					});
					res.on("end", () => resolve({ status, chunks, bytes, truncated, content_type: (res.headers["content-type"] as string | undefined) ?? null, final_url: target }));
					res.on("error", reject);
				},
			);
			req.on("timeout", () => req.destroy(new Error(`délai dépassé (${TIMEOUT_MS} ms) via Tor`)));
			req.on("error", reject);
			req.end();
		});
	}

	return hop(url, 0).then(
		(r) => ({
			status: r.status,
			elapsed_ms: Date.now() - started,
			bytes: r.bytes,
			truncated: r.truncated,
			text: r.chunks.length > 0 ? decodeBody(Buffer.concat(r.chunks), r.content_type).text : "",
			content_type: r.content_type,
			error: null,
			transport: "tor" as const,
			final_url: r.final_url,
		}),
		(err) => ({
			status: null,
			elapsed_ms: Date.now() - started,
			bytes: 0,
			truncated: false,
			text: "",
			content_type: null,
			error: describeError(err),
			transport: "tor" as const,
			final_url: url,
		}),
	);
}

function classify(probe: Probe, source: RedSource): Classification {
	const code = probe.status;
	const none = { items_detectes: 0, strategie_detection: null as DetectionStrategy | null };
	if (isTimeout(probe.error)) return { ...none, cause: "timeout", detail: probe.error ?? "délai dépassé" };
	if (probe.error) return { ...none, cause: "autre", detail: `erreur réseau : ${probe.error}` };
	if (code === null) return { ...none, cause: "autre", detail: "aucun code HTTP reçu" };
	if (code === 404 || code === 410) return { ...none, cause: "disparue", detail: `HTTP ${code}` };
	if (code === 403) return { ...none, cause: "bloquée", detail: `HTTP ${code}` };
	if (code >= 500 && code <= 599) return { ...none, cause: "serveur", detail: `HTTP ${code}` };
	if (code < 200 || code >= 300) return { ...none, cause: "autre", detail: `HTTP ${code}` };

	const body = probe.text.trim();
	if (probe.truncated) return { ...none, cause: "autre", detail: `HTTP ${code}, corps > ${MAX_BODY_BYTES} octets tronqué à la lecture` };
	if (body.length === 0) return { ...none, cause: "flux vide", detail: `HTTP ${code}, corps vide` };

	// Le détecteur du collecteur, pas une approximation : mesure réelle du
	// nombre d'items que le code de production extrait du corps reçu.
	const detection = detectItems(probe.text, probe.content_type);
	const measured = { items_detectes: detection.items.length, strategie_detection: detection.strategy };
	const format = source.format.toLowerCase();

	if (format === "rss" || format === "atom" || format === "xml") {
		const valid = XMLValidator.validate(body.slice(0, MAX_PARSE_CHARS));
		if (valid !== true) {
			return { ...measured, cause: "contenu non parsable", detail: `HTTP ${code}, XML invalide : ${valid.err.msg.slice(0, 80)}` };
		}
		if (!/<(rss|feed|rdf:RDF)(?=[\s>])/i.test(body.slice(0, MAX_PARSE_CHARS))) {
			return { ...measured, cause: "contenu non parsable", detail: `HTTP ${code}, XML valide mais pas un flux rss/atom` };
		}
		if (detection.items.length === 0) {
			return { ...measured, cause: "flux vide", detail: `HTTP ${code}, flux RSS/Atom sans item reconnu par le collecteur` };
		}
		return { ...measured, cause: "autre", detail: `HTTP ${code}, ${detection.strategy} : ${detection.items.length} item(s) extraits` };
	}

	if (format === "json") {
		let data: unknown;
		try {
			data = JSON.parse(body.slice(0, MAX_PARSE_CHARS));
		} catch (err) {
			return { ...measured, cause: "contenu non parsable", detail: `HTTP ${code}, JSON invalide : ${describeError(err).slice(0, 80)}` };
		}
		if (data === null || (typeof data === "object" && Object.keys(data as object).length === 0)) {
			return { ...measured, cause: "flux vide", detail: `HTTP ${code}, JSON vide` };
		}
		return { ...measured, cause: "autre", detail: `HTTP ${code}, JSON valide, ${detection.items.length} item(s) extraits (${detection.strategy})` };
	}

	if (format === "txt" || format === "text") {
		const lignes = body.split(/\r?\n/).filter((l) => {
			const t = l.trim();
			return t.length > 0 && !t.startsWith("#");
		}).length;
		return { ...measured, cause: "autre", detail: `HTTP ${code}, liste brute : ${lignes} ligne(s) d'indicateur, ${detection.items.length} item(s) détectés` };
	}

	if (format === "html" && detection.strategy === "none") {
		return { ...measured, cause: "contenu non parsable", detail: `HTTP ${code}, page HTML de ${probe.bytes} octets sans item extractible par detectItems() (stratégie none)` };
	}
	return { ...measured, cause: "autre", detail: `HTTP ${code}, détection ${detection.strategy} : ${detection.items.length} item(s), ${probe.bytes} octets` };
}

function wilson(k: number, n: number, z = 1.96): [number, number] {
	if (n === 0) return [0, 0];
	const p = k / n;
	const den = 1 + (z * z) / n;
	const center = (p + (z * z) / (2 * n)) / den;
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
	return [Math.max(0, center - half), Math.min(1, center + half)];
}

async function main(): Promise<void> {
	const all = await query<RedSource>(RED_SQL);
	console.log(`Sources rouges (7 j, observed_at ou collected_at) : ${all.rows.length}`);
	if (all.rows.length !== 214) {
		throw new Error(`Population rouge inattendue : ${all.rows.length} (attendu 214)`);
	}
	const picked = sampleRandom(all.rows, SAMPLE_SIZE, SEED);
	const entries: Entry[] = new Array(picked.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(CONCURRENCY, picked.length) }, async () => {
		for (;;) {
			const index = next++;
			if (index >= picked.length) return;
			const source = picked[index];
			if (!source.url || (!source.url.startsWith("http://") && !source.url.startsWith("https://"))) {
				throw new Error(`URL non HTTP dans l'échantillon : ${source.id} ${source.url}`);
			}
			const probe: Probe = isOnion(source.url) ? await probeTor(source.url) : await probeDirect(source.url);
			const verdict = classify(probe, source);
			entries[index] = {
				id: source.id,
				name: source.name,
				url: source.url,
				format: source.format,
				code_http: probe.status,
				temps_ms: probe.elapsed_ms,
				taille_octets: probe.bytes,
				cause: verdict.cause,
				extrait: excerpt(probe.text, probe.error),
				detail: verdict.detail,
				items_detectes: verdict.items_detectes,
				strategie_detection: verdict.strategie_detection,
				transport: probe.transport,
				url_finale: probe.final_url,
				corps_tronque: probe.truncated,
				fetch_realise: true,
			};
			console.log(`[${index + 1}/${picked.length}] ${probe.status ?? "—"} ${verdict.cause} ${source.url.slice(0, 70)}`);
			if (index < picked.length - 1) await sleep(150);
		}
	});
	await Promise.all(workers);
	if (entries.some((e) => e === undefined)) throw new Error("fetch manquant pour au moins une source");

	const counts = Object.fromEntries(CAUSES.map((c) => [c, entries.filter((e) => e.cause === c).length])) as Record<Cause, number>;
	const population = all.rows.length;
	const exact = CAUSES.map((cause) => (counts[cause] / SAMPLE_SIZE) * population);
	const points = exact.map(Math.floor);
	let reste = population - points.reduce((a, b) => a + b, 0);
	const ordre = exact
		.map((value, index) => ({ index, frac: value - Math.floor(value) }))
		.sort((a, b) => b.frac - a.frac);
	for (const { index } of ordre) {
		if (reste-- <= 0) break;
		points[index] += 1;
	}
	const repartition = CAUSES.map((cause, i) => {
		const n = counts[cause];
		const [lo, hi] = wilson(n, SAMPLE_SIZE);
		return {
			cause,
			observe_n: n,
			observe_pct: Math.round((1000 * n) / SAMPLE_SIZE) / 10,
			extrapolation_point_214: points[i],
			extrapolation_ic95_214: [Math.round(lo * population), Math.round(hi * population)],
		};
	});
	const result = {
		genere_le: new Date().toISOString(),
		methode: {
			base: DATABASE,
			definition_rouge: "Source sans fait sur 7 jours : COALESCE(event.observed_at, event.collected_at) < now() - 7 jours, ou aucun fait. Définition de GET /api/health/detail.",
			population_sources: 296,
			population_rouges: population,
			tirage: `échantillon aléatoire de ${SAMPLE_SIZE} parmi ${population}, PRNG mulberry32 graine ${SEED}, tri préalable par id`,
			graine: SEED,
			fetch: `GET réel une fois par source, redirect:follow, AbortSignal.timeout(${TIMEOUT_MS} ms), corps lu jusqu'à ${MAX_BODY_BYTES} octets, User-Agent ${USER_AGENT} ; corps analysé par detectItems() du collecteur`,
			onion: `URL .onion sondées via Tor (RADAR_TOR_SOCKS), même timeout de ${TIMEOUT_MS} ms ; circuit Tor à froid peut surestimer « timeout »`,
			classification: {
				disparue: "HTTP 404 ou 410",
				bloquée: "HTTP 403",
				serveur: "HTTP 5xx",
				timeout: "abandon du fetch après 10 s (AbortError/ETIMEDOUT)",
				"contenu non parsable": "HTTP 2xx sans aucun item extractible par detectItems() : XML invalide/pas un flux, JSON invalide, ou page HTML sans stratégie d'extraction",
				"flux vide": "HTTP 2xx, corps vide, JSON vide, ou flux RSS/Atom sans item reconnu par detectItems()",
				autre: "erreur réseau hors timeout, autre code HTTP, ou HTTP 2xx avec contenu non vide exploitable ; items_detectes et strategie_detection documentent la mesure",
			},
			limites: [
				"Seules les 40 sources de l'échantillon ont été classées ; aucune des 174 autres n'a été sondée ni classée individuellement.",
				"Les parts sur 214 sont une EXTRAPOLATION d'un échantillon aléatoire, pas des causes mesurées ; IC95 de Wilson indicatif (tirage sans remise non corrigé).",
				"Un HTTP 2xx avec des items détectés ne dit pas pourquoi aucun événement n'a été produit : filtre de pertinence, filtre d'actifs, ancienneté des faits et ordonnancement ne sont pas mesurés ici (aucune écriture en base n'a été faite).",
				"`taille_octets` compte les octets du corps lus par le client HTTP (après décompression de transport) ; corps_tronque indique un dépassement de la limite de lecture.",
			],
		},
		sources: entries,
		repartition_echantillon: repartition,
		extrapolation: {
			avertissement: "EXTRAPOLATION : estimation à partir de 40 tirages au sort sur 214 ; pas une mesure exhaustive.",
			population_rouges: population,
			non_classees_individuellement: population - SAMPLE_SIZE,
			par_cause: repartition,
		},
	};
	await writeFile(OUTPUT, `${JSON.stringify(result, null, 1)}\n`, "utf8");
	console.log(`\nÉcrit ${OUTPUT}`);
	for (const row of repartition) console.log(`${row.cause.padEnd(22)} ${String(row.observe_n).padStart(2)}/40  → ~${row.extrapolation_point_214}/214 (extrapolation)`);
}

main()
	.catch((err: unknown) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => {
		void closePools();
	});
