/**
 * Importe les sources déclarées dans `bench/corpus/sources-*.jsonl` dans `source`.
 *
 * Une ligne JSONL décrit une source, par exemple :
 *   {"slug":"cert-fr-avis","name":"CERT-FR — avis","url":"https://…/feed/","family":"cert_fr","format":"rss"}
 * Champs reconnus : slug (ou id), name (ou title), url, family, format, kind,
 * license/licence, description/note, enabled. Les champs absents sont déduits
 * du nom et de l'URL ; `family` par défaut = `cti`.
 *
 * Une source n'est retenue que si son URL répond strictement HTTP 200 et
 * renvoie un corps non vide (au moins un octet autres que blancs). L'identifiant
 * est stable : `corpus:<slug>`, où le slug est normalisé (ASCII minuscule,
 * séparateurs `-`). Un même slug n'est sondé qu'une fois, même sur plusieurs
 * fichiers.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/importer-corpus.mts             # rapport, aucune écriture
 *   apps/api/node_modules/.bin/tsx scripts/importer-corpus.mts --appliquer # écrit en base
 *   apps/api/node_modules/.bin/tsx scripts/importer-corpus.mts --dir /tmp/corpus --appliquer
 *
 * `--apply` est accepté comme alias de `--appliquer`. Les écritures se font
 * dans une transaction : soit toutes les sources valides sont insérées, soit
 * aucune. Les sources déjà présentes voient leurs métadonnées rafraîchies,
 * mais leur état `enabled` n'est jamais modifié.
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORPUS_DIR = fileURLToPath(new URL("../bench/corpus/", import.meta.url));
const USER_AGENT = "RadarCyberCorpusImport/1.0";
const TIMEOUT_MS = 15_000;
/** On ne lit que le début du corps : un flux de 10 Mo n'a pas besoin d'être téléchargé. */
const SAMPLE_BYTES = 64 * 1024;

type Verdict = "valide" | "morte" | "invalide" | "doublon" | "ignoree";

interface Ligne {
	file: string;
	line: number;
	id: string;
	name: string;
	url: string;
	family: string;
	kind: string;
	format: string;
	license: string | null;
	description: string | null;
	status: number | null;
	contentType: string | null;
	bytes: number;
	verdict: Verdict;
	detail: string;
}

interface Options {
	apply: boolean;
	dir: string;
}

interface Probe {
	ok: boolean;
	status: number | null;
	contentType: string | null;
	bytes: number;
	detail: string;
}

function usage(): string {
	return [
		"Usage : tsx scripts/importer-corpus.mts [--appliquer] [--dir <dossier>]",
		"  défaut       : rapport HTTP, aucune écriture en base",
		"  --appliquer  : insère/rafraîchit les sources valides (alias : --apply)",
		"  --dir        : dossier à lire au lieu de bench/corpus",
	].join("\n");
}

function parseArgs(argv: string[]): Options {
	const options: Options = { apply: false, dir: CORPUS_DIR };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--appliquer" || arg === "--apply") {
			options.apply = true;
		} else if (arg === "--dry-run") {
			options.apply = false;
		} else if (arg === "--dir") {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith("--")) throw new Error("--dir attend un dossier");
			options.dir = value;
			i++;
		} else if (arg === "--help" || arg === "-h") {
			process.stdout.write(usage() + "\n");
			process.exit(0);
		} else {
			throw new Error(`argument inconnu : ${arg}`);
		}
	}
	return options;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function field(record: Record<string, unknown>, names: string[]): string | null {
	for (const name of names) {
		const value = text(record[name]);
		if (value !== null) return value;
	}
	return null;
}

function slugify(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96)
		.replace(/-+$/g, "");
}

function urlHint(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
	} catch {
		return "";
	}
}

function inferFamily(haystack: string): string {
	const value = haystack.toLowerCase();
	if (/ransom|leak|breach|exfiltr/.test(value)) return "ransomware";
	if (/cve|nvd|vulnerab|faiblesse/.test(value)) return "vuln";
	if (/phish|hame[cç]on/.test(value)) return "phishing";
	if (/malware|bazaar|botnet|feodo|threatfox/.test(value)) return "malware";
	if (/cyber\.gouv\.fr|cert\.ssi\.gouv\.fr|cert-fr/.test(value)) return "cert_fr";
	if (/cert|ct log|crt\.sh|transparence/.test(value)) return "cert";
	if (/blocklist|blacklist|spamhaus|réputation|reputation/.test(value)) return "reputation";
	if (/presse|journal|news|actualit/.test(value)) return "presse";
	return "cti";
}

function inferFormat(url: string): string {
	if (/\.csv(\?|$)/i.test(url) || /\.txt(\?|$)/i.test(url) || /blocklist|blacklist/i.test(url)) return "txt";
	if (/\.json(\?|$)/i.test(url) || /\/api\//i.test(url)) return "json";
	return "rss";
}

function blank(file: string, line: number): Ligne {
	return {
		file,
		line,
		id: "—",
		name: "—",
		url: "—",
		family: "—",
		kind: "—",
		format: "—",
		license: null,
		description: null,
		status: null,
		contentType: null,
		bytes: 0,
		verdict: "invalide",
		detail: "",
	};
}

function parseLine(raw: string, file: string, line: number): Ligne {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
	} catch (error) {
		return { ...blank(file, line), detail: `JSON invalide : ${message(error)}` };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ...blank(file, line), detail: "objet JSON attendu" };
	}

	const record = parsed as Record<string, unknown>;
	const url = field(record, ["url"]) ?? "";
	const rawSlug = field(record, ["slug", "id"]);
	const name = field(record, ["name", "title"]) ?? rawSlug ?? urlHint(url);
	const slug = slugify(rawSlug?.replace(/^corpus:/i, "") ?? name);
	if (slug === "") {
		return { ...blank(file, line), detail: "slug impossible à déterminer" };
	}

	const format = (field(record, ["format"]) ?? inferFormat(url)).toLowerCase();
	const kind = field(record, ["kind"]) ?? (format === "txt" ? "indicator" : "narrative");
	const entry: Ligne = {
		...blank(file, line),
		id: `corpus:${slug}`,
		verdict: "valide",
		name,
		url,
		family: field(record, ["family"]) ?? inferFamily(`${name} ${url}`),
		kind,
		format,
		license: field(record, ["license", "licence"]),
		description: field(record, ["description", "note"]),
	};

	if (url === "") {
		entry.verdict = "invalide";
	} else {
		try {
			const parsedUrl = new URL(url);
			if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
				entry.verdict = "invalide";
			}
		} catch {
			entry.verdict = "invalide";
		}
	}
	if (record.enabled === false || record.actif === false) {
		entry.verdict = "ignoree";
		entry.detail = "source désactivée dans le corpus";
	}
	return entry;
}

function isBlankByte(byte: number): boolean {
	return byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20;
}

async function probeUrl(url: string): Promise<Probe> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { "user-agent": USER_AGENT, accept: "*/*" },
			redirect: "follow",
			signal: controller.signal,
		});
		const status = response.status;
		const contentType = response.headers.get("content-type");
		if (status !== 200) {
			await response.body?.cancel().catch(() => {});
			return { ok: false, status, contentType, bytes: 0, detail: `HTTP ${status}` };
		}
		if (response.body === null) {
			return { ok: false, status, contentType, bytes: 0, detail: "corps absent" };
		}

		const reader = response.body.getReader();
		let bytes = 0;
		let hasContent = false;
		try {
			while (bytes < SAMPLE_BYTES) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.byteLength;
				if (value.some((byte: number) => !isBlankByte(byte))) {
					hasContent = true;
					break;
				}
			}
		} finally {
			await reader.cancel().catch(() => {});
		}
		if (!hasContent) {
			return { ok: false, status, contentType, bytes, detail: "corps vide ou uniquement blanc" };
		}
		return { ok: true, status, contentType, bytes, detail: "200 · contenu non vide" };
	} catch (error) {
		const detail = controller.signal.aborted ? `délai de ${String(TIMEOUT_MS)} ms dépassé` : message(error);
		return { ok: false, status: null, contentType: null, bytes: 0, detail };
	} finally {
		clearTimeout(timer);
	}
}

async function readLines(dir: string): Promise<{ lines: Ligne[]; files: string[] }> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { lines: [], files: [] };
		throw error;
	}

	const files = names.filter((n) => /^sources-.*\.jsonl$/.test(n)).sort();
	const lines: Ligne[] = [];
	for (const name of files) {
		const file = join(dir, name);
		const content = await readFile(file, "utf8");
		const records = content.split(/\r?\n/);
		for (let i = 0; i < records.length; i++) {
			const raw = records[i].trim();
			if (raw === "" || raw.startsWith("#")) continue;
			lines.push(parseLine(raw, file, i + 1));
		}
	}
	return { lines, files };
}

async function evaluate(lines: Ligne[]): Promise<void> {
	const seen = new Set<string>();
	for (const line of lines) {
		if (line.verdict !== "valide") continue; // erreur de parsing ou source désactivée
		if (seen.has(line.id)) {
			line.verdict = "doublon";
			line.detail = "slug déjà retenu dans un fichier précédent";
			continue;
		}
		seen.add(line.id);
		const probe = await probeUrl(line.url);
		line.status = probe.status;
		line.contentType = probe.contentType;
		line.bytes = probe.bytes;
		line.detail = probe.detail;
		line.verdict = probe.ok ? "valide" : "morte";
	}
}

function pad(value: string, width: number): string {
	return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function report(lines: Ligne[], files: number, apply: boolean): void {
	const counts: Record<Verdict, number> = { valide: 0, morte: 0, invalide: 0, doublon: 0, ignoree: 0 };
	for (const line of lines) counts[line.verdict]++;

	console.log(`${apply ? "APPLICATION" : "RAPPORT (aucune écriture)"} — ${String(files)} fichier(s), ${String(lines.length)} ligne(s)`);
	console.log(`${pad("identifiant", 32)} ${pad("statut", 7)} ${pad("octets", 8)} ${pad("verdict", 9)} détail`);
	for (const line of lines) {
		const status = line.status === null ? "—" : String(line.status);
		console.log(
			`${pad(line.id, 32)} ${pad(status, 7)} ${pad(String(line.bytes), 8)} ${pad(line.verdict, 9)} ${line.detail}`,
		);
	}
	console.log(
		`\nvalides : ${String(counts.valide)} · mortes : ${String(counts.morte)} · invalides : ${String(counts.invalide)} · doublons : ${String(counts.doublon)} · ignorées : ${String(counts.ignoree)}`,
	);
	if (!apply) console.log(`Relancer avec --appliquer pour insérer ${String(counts.valide)} source(s).`);
}

async function apply(lines: Ligne[]): Promise<void> {
	const valides = lines.filter((line) => line.verdict === "valide");
	if (valides.length === 0) {
		console.log("Aucune source valide : aucune écriture en base.");
		return;
	}

	const { withTransaction, closePools } = await import("../apps/api/src/db.js");
	try {
		const result = await withTransaction(async (client) => {
			let inserted = 0;
			let updated = 0;
			for (const line of valides) {
				const res = await client.query<{ inserted: boolean }>(
					`INSERT INTO source (id, name, family, url, license, kind, format, parser, description)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
					 ON CONFLICT (id) DO UPDATE SET
					   name = EXCLUDED.name,
					   family = EXCLUDED.family,
					   url = EXCLUDED.url,
					   license = EXCLUDED.license,
					   kind = EXCLUDED.kind,
					   format = EXCLUDED.format,
					   parser = EXCLUDED.parser,
					   description = EXCLUDED.description
					 RETURNING (xmax = 0) AS inserted`,
					[
						line.id,
						line.name,
						line.family,
						line.url,
						line.license,
						line.kind,
						line.format,
						JSON.stringify({ corpus: basename(line.file), ligne: line.line }),
						line.description,
					],
				);
				if (res.rows[0]?.inserted === true) inserted++;
				else updated++;
			}
			return { inserted, updated };
		});
		console.log(`\nÉcritures : ${String(result.inserted)} insérée(s), ${String(result.updated)} mise(s) à jour.`);
	} finally {
		await closePools();
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const { lines, files } = await readLines(options.dir);
	await evaluate(lines);
	report(lines, files.length, options.apply);
	if (options.apply) await apply(lines);
}

try {
	await main();
} catch (error) {
	process.stderr.write(`importer-corpus: ${message(error)}\n`);
	process.exitCode = 1;
}
