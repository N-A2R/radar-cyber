#!/usr/bin/env -S npx tsx
/**
 * Génère la migration `db/migrate-211-actor-alias.sql` depuis MISP Galaxy.
 *
 * Sources (MISP Galaxy, jeu public) :
 *  - clusters/ransomware.json      : programmes et groupes rançongiciel ;
 *  - clusters/threat-actor.json    : acteurs de la menace et leurs synonymes.
 *
 * Chaque ligne produite porte la grappe qui l'atteste (`source`, `source_url`,
 * `galaxy_uuid`). Une grappe sans source fait échouer la génération : aucune
 * fusion n'est écrite sans preuve.
 *
 * Usage :
 *   tsx scripts/generate-actor-alias-seed.mts            # écrit la migration
 *   tsx scripts/generate-actor-alias-seed.mts --check    # échoue si périmée
 *   tsx scripts/generate-actor-alias-seed.mts --out -    # affiche le SQL
 *
 * Variables d'environnement (tests hors ligne) :
 *   MISP_RANSOMWARE_URL, MISP_THREAT_ACTOR_URL
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	actorAliasKey,
	clusterActorAliases,
	type ActorAliasRow,
	type GalaxyClusterInput,
} from "../apps/api/src/ransomware/actor-alias.js";

const OUTPUT = fileURLToPath(new URL("../db/migrate-211-actor-alias.sql", import.meta.url));
const RANSOMWARE_URL =
	process.env.MISP_RANSOMWARE_URL ??
	"https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/ransomware.json";
const THREAT_ACTOR_URL =
	process.env.MISP_THREAT_ACTOR_URL ??
	"https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json";
const GALAXY_WEB_BASE = "https://github.com/MISP/misp-galaxy/blob/main/clusters";

type GalaxyValue = {
	value: string;
	uuid?: string;
	meta?: {
		synonyms?: string[];
		extensions?: string[];
		refs?: string[];
	};
};

type GalaxyFile = { values?: GalaxyValue[] };

const argv = process.argv.slice(2);
const check = argv.includes("--check");
const outIndex = argv.indexOf("--out");
const outArg = argv.find((arg) => arg.startsWith("--out=")) ?? (outIndex >= 0 ? `--out=${argv[outIndex + 1] ?? "-"}` : undefined);
const outPath = outArg ? outArg.slice("--out=".length) : OUTPUT;

async function loadGalaxy(url: string): Promise<GalaxyFile> {
	if (url.startsWith("file://")) return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as GalaxyFile;
	if (!url.includes("://")) return JSON.parse(readFileSync(url, "utf8")) as GalaxyFile;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
	return (await response.json()) as GalaxyFile;
}

function clustersOf(
	file: GalaxyFile,
	source: string,
	fileName: string,
): GalaxyClusterInput[] {
	return (file.values ?? []).map((entry) => ({
		value: entry.value,
		synonyms: entry.meta?.synonyms ?? [],
		extensions: entry.meta?.extensions ?? [],
		refs: entry.meta?.refs?.length ?? 0,
		uuid: entry.uuid,
		source,
		sourceUrl: entry.uuid ? `${GALAXY_WEB_BASE}/${fileName}.json#${entry.uuid}` : `${GALAXY_WEB_BASE}/${fileName}.json`,
	}));
}

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function render(rows: readonly ActorAliasRow[]): string {
	const lines: string[] = [];
	lines.push("-- Migration générée : ne pas éditer à la main.");
	lines.push("-- Régénérer avec : pnpm genere:actor-alias");
	lines.push("--");
	lines.push("-- Source : MISP Galaxy clusters/ransomware.json + clusters/threat-actor.json");
	lines.push("-- Chaque alias porte la grappe qui l'atteste. Une fusion sans source");
	lines.push("-- est impossible : `source` et `source_url` sont NOT NULL et non vides.");
	lines.push("");
	lines.push("CREATE TABLE IF NOT EXISTS actor_alias (");
	lines.push("  id          bigserial PRIMARY KEY,");
	lines.push("  canonique   text NOT NULL,");
	lines.push("  alias       text NOT NULL,");
	lines.push("  alias_norm  text NOT NULL,");
	lines.push("  source      text NOT NULL,");
	lines.push("  source_url  text NOT NULL,");
	lines.push("  galaxy_uuid uuid,");
	lines.push("  imported_at timestamptz NOT NULL DEFAULT now(),");
	lines.push("  CONSTRAINT actor_alias_canonique_non_vide CHECK (btrim(canonique) <> ''),");
	lines.push("  CONSTRAINT actor_alias_alias_non_vide CHECK (btrim(alias) <> ''),");
	lines.push("  CONSTRAINT actor_alias_alias_norm_non_vide CHECK (btrim(alias_norm) <> ''),");
	lines.push("  CONSTRAINT actor_alias_source_non_vide CHECK (btrim(source) <> '' AND btrim(source_url) <> ''),");
	lines.push("  CONSTRAINT actor_alias_alias_source_unique UNIQUE (alias, source, source_url)");
	lines.push(");");
	lines.push("");
	lines.push("CREATE INDEX IF NOT EXISTS actor_alias_canonique_idx ON actor_alias (canonique);");
	lines.push("CREATE INDEX IF NOT EXISTS actor_alias_norm_idx ON actor_alias (alias_norm);");
	lines.push("");
	lines.push("COMMENT ON TABLE actor_alias IS");
	lines.push("  'Alias d''acteurs et de programmes rançongiciel issus de MISP Galaxy ; chaque ligne porte sa source.';");
	lines.push("");
	lines.push("INSERT INTO actor_alias (canonique, alias, alias_norm, source, source_url, galaxy_uuid) VALUES");
	const values = rows.map((row) => {
		const uuid = row.galaxyUuid ? `${sqlString(row.galaxyUuid)}::uuid` : "NULL";
		return `  (${sqlString(row.canonique)}, ${sqlString(row.alias)}, ${sqlString(row.aliasNorm)}, ${sqlString(row.source)}, ${sqlString(row.sourceUrl)}, ${uuid})`;
	});
	lines.push(values.join(",\n"));
	lines.push("ON CONFLICT ON CONSTRAINT actor_alias_alias_source_unique DO NOTHING;");
	lines.push("");
	return lines.join("\n");
}

const [ransomware, threatActor] = await Promise.all([loadGalaxy(RANSOMWARE_URL), loadGalaxy(THREAT_ACTOR_URL)]);

const components = clusterActorAliases([
	...clustersOf(ransomware, "misp-galaxy:ransomware", "ransomware"),
	...clustersOf(threatActor, "misp-galaxy:threat-actor", "threat-actor"),
]);

// On ne stocke que les composantes qui portent au moins deux graphies : une
// ligne isolée n'est pas un alias, et gonflerait la table sans information.
const retained = components.filter((component) => component.aliases.length >= 2);
const rows = retained.flatMap((component) => component.rows);
const sql = render(rows);

const grouped = new Map<string, number>();
for (const row of rows) grouped.set(row.canonique, (grouped.get(row.canonique) ?? 0) + 1);
const withTwoOrMore = [...grouped.values()].filter((count) => count >= 2).length;

if (check) {
	const current = readFileSync(OUTPUT, "utf8");
	if (current !== sql) {
		console.error("Migration actor_alias périmée : régénérer avec pnpm genere:actor-alias");
		process.exit(1);
	}
	console.error("Migration actor_alias à jour.");
	process.exit(0);
}

if (outPath === "-") {
	process.stdout.write(sql);
} else {
	writeFileSync(outPath, sql);
}

const lockbit = components.find((component) => component.aliases.some((alias) => actorAliasKey(alias) === "lockbit"));
console.error(
	[
		`Composantes Galaxy : ${components.length}`,
		`Composantes retenues (>=2 graphies) : ${retained.length}`,
		`Lignes actor_alias : ${rows.length}`,
		`Canoniques avec >=2 alias : ${withTwoOrMore}`,
		lockbit
			? `LockBit -> ${lockbit.canonique} : ${lockbit.aliases.join(", ")}`
			: "LockBit introuvable",
		`Sortie : ${outPath === "-" ? "stdout" : outPath}`,
	].join("\n"),
);

if (withTwoOrMore < 20) {
	console.error(`Critère non atteint : ${withTwoOrMore} < 20 canoniques avec au moins deux alias.`);
	process.exit(1);
}
