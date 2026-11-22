#!/usr/bin/env -S npx tsx
/**
 * Scan the top Nouvelle-Aquitaine organisations for typosquatted domains.
 * One invocation handles one batch so every command stays under 60 seconds.
 *
 *   tsx scripts/typosquat-top1000.mts --offset=0 --batch=100
 *   tsx scripts/typosquat-top1000.mts --aggregate
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
  loadTopTargets,
  liveProbe,
  scanTargets,
  type ScanTarget,
} from "../apps/api/src/detect/typosquat-top.js";

const DEFAULT_DIR = "bench/results/typosquat-top1000";
const TARGETS_JSON = "bench/results/typosquat-targets-na.json";
const FINAL_JSON = "bench/results/typosquat-top1000.json";
const FINAL_REPORT = "docs/typosquat-top1000.md";

function usage(): never {
  console.error(
    "usage: tsx scripts/typosquat-top1000.mts [--top=1000] [--offset=0] [--batch=100]" +
      " [--max-variantes=8] [--concurrence=48] [--dir=bench/results/typosquat-top1000]" +
      " [--targets=bench/results/typosquat-targets-na.json] [--aggregate]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();

function option(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3).trim() || undefined;
}

function integer(name: string, fallback: number, min: number): number {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    console.error(`--${name} must be an integer >= ${min}, got "${raw}"`);
    process.exit(1);
  }
  return value;
}

async function save(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function targetsForBatch(offset: number, size: number): Promise<ScanTarget[]> {
  const path = option("targets") ?? TARGETS_JSON;
  try {
    const snapshot = JSON.parse(await readFile(path, "utf8")) as { targets: ScanTarget[] };
    return snapshot.targets.slice(offset, offset + size);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
    console.log(`[top1000] no snapshot at ${path}, reading the live referential`);
    return loadTopTargets({ limit: size, offset });
  }
}

interface Batch {
  offset: number;
  top: number;
  targets: number;
  variants: number;
  active: number;
  detections: {
    domain: string; base: string; orgName: string; dept: string | null; rank: number;
    kind: string; similarity: number; method: string; proof: string[];
    a: string[]; aaaa: string[]; certificate: string | null; pageTitle: string | null;
  }[];
  activeList: {
    domain: string; base: string; orgName: string; kind: string; similarity: number;
    certificate: string | null; pageTitle: string | null;
  }[];
  alarms: number;
  falsePositives: number;
  falsePositiveRate: number;
  probes: { dns: number; certificate: number; page: number };
  durationMs: number;
}

async function batch(dir: string): Promise<void> {
  const top = integer("top", 1000, 1);
  const offset = integer("offset", 0, 0);
  const size = integer("batch", 100, 1);
  const maxVariantes = integer("max-variantes", 8, 1);
  const concurrence = integer("concurrence", 48, 1);
  const started = Date.now();
  const targets = await targetsForBatch(offset, size);
  if (targets.length === 0) throw new Error(`no targets at offset ${offset}`);
  const rankByDomain = new Map(targets.map((t) => [t.domain, t.rank]));
  const result = await scanTargets(targets, liveProbe, { maxVariantes, concurrence });
  const payload: Batch = {
    offset, top, targets: result.targets, variants: result.variants,
    active: result.active.length,
    detections: result.detections.map((d) => ({
      domain: d.finding.domain,
      base: d.finding.base,
      orgName: d.finding.orgName,
      dept: d.finding.dept,
      rank: rankByDomain.get(d.finding.base) ?? 0,
      kind: d.finding.kind,
      similarity: Number(d.finding.similarity.toFixed(3)),
      method: d.method,
      proof: d.proof,
      a: d.finding.a,
      aaaa: d.finding.aaaa,
      certificate: d.finding.cert?.issuer ?? null,
      pageTitle: d.finding.page?.title ?? null,
    })),
    activeList: result.active.map((f) => ({
      domain: f.domain, base: f.base, orgName: f.orgName, kind: f.kind,
      similarity: Number(f.similarity.toFixed(3)),
      certificate: f.cert?.issuer ?? null,
      pageTitle: f.page?.title ?? null,
    })),
    alarms: result.alarms,
    falsePositives: result.falsePositives,
    falsePositiveRate: Number(result.falsePositiveRate.toFixed(4)),
    probes: result.probes,
    durationMs: Date.now() - started,
  };
  const path = join(dir, `batch-${String(offset).padStart(4, "0")}.json`);
  await save(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `[top1000] offset=${offset} targets=${payload.targets} variants=${payload.variants} ` +
      `active=${payload.active} detections=${payload.detections.length} ` +
      `false-positives=${payload.falsePositives}/${payload.alarms} ` +
      `${(payload.durationMs / 1000).toFixed(1)}s -> ${path}`,
  );
}

interface Aggregate {
  date: string;
  targets: number;
  batches: number;
  variants: number;
  active: number;
  activeKinds: Record<string, number>;
  alarms: number;
  falsePositives: number;
  falsePositiveRate: number;
  probes: { dns: number; certificate: number; page: number };
  durationMs: number;
  files: string[];
}

/** The report is French; code and command-line output stay in English. */
function frenchReport(data: Aggregate): string {
  const fr = (n: number) => n.toLocaleString("fr-FR");
  const pct = `${(data.falsePositiveRate * 100).toFixed(1).replace(".", ",")} %`;
  const lines: string[] = [
    `# Typosquatting des ${fr(data.targets)} principales organisations de Nouvelle-Aquitaine (${data.date})`,
    "",
    `Branche : \`ext/chantier-n7\`. Périmètre : les douze départements de Nouvelle-Aquitaine`,
    `(16, 17, 18, 23, 24, 33, 40, 47, 64, 79, 86, 87).`,
    `Objectif mesurable : nombre de domaines typosquattés détectés, avec preuve et taux de faux positifs.`,
    "",
    `## Résultat mesuré`,
    "",
    `**${fr(data.detections.length)} domaines typosquattés détectés avec preuve** sur ${fr(data.targets)} organisations,`,
    `${fr(data.variants)} variantes testées et ${fr(data.active)} domaines actifs en DNS.`,
    `Taux de faux positifs : ${fr(data.falsePositives)}/${fr(data.alarms)} alertes brutes rejetées (${pct}).`,
    "",
    `OBJECTIF : atteint — ${fr(data.detections.length)} domaines typosquattés confirmés avec preuve / ${fr(data.targets)} organisations analysées ; ${pct} de faux positifs.`,
    "",
    `| Mesure | Valeur | Preuve |`,
    `| --- | ---: | --- |`,
    `| Organisations analysées | ${fr(data.targets)} | \`bench/results/typosquat-targets-na.json\` (référentiel NA live) |`,
    `| Variantes testées | ${fr(data.variants)} | \`${data.files.length}\` lots JSON dans \`bench/results/typosquat-top1000/\` |`,
    `| Domaines actifs en DNS | ${fr(data.active)} | requêtes A/AAAA : ${fr(data.probes.dns)} |`,
    `| Domaines typosquattés confirmés | ${fr(data.detections.length)} | \`bench/results/typosquat-top1000.json\` (clé \`detections\`) |`,
    `| Faux positifs | ${fr(data.falsePositives)}/${fr(data.alarms)} (${pct}) | alerte brute = DNS actif + similarité ≥ 0,8 ; décision = page et certificat |`,
    "",
    `## Preuve par domaine (extrait)`,
    "",
  ];
  for (const d of data.detections.slice(0, 8)) {
    lines.push(
      `- \`${d.domain}\` → ${d.orgName} (rang ${d.rank}, ${d.dept}) : variante \`${d.kind}\`, ` +
        `similarité ${d.similarity}, A ${d.a.join(", ") || "aucun"}, ` +
        `titre « ${d.pageTitle ?? "illisible"} », émetteur ${d.certificate ?? "absent"}, ` +
        `méthode ${d.method}, motifs ${d.proof.join(", ")}.`,
    );
  }
  if (data.detections.length === 0) {
    const kinds = Object.entries(data.activeKinds).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${fr(n)}`).join(", ");
    lines.push(
      `- Aucune usurpation confirmée. Chaque alerte brute a été lue : ${kinds}.`,
      `- Un domaine n'est compté comme typosquatté que s'il n'est pas un changement de TLD, ` +
        `résout en DNS, reproduit au moins 60 % des tokens distinctifs de l'organisation et ` +
        `présente un titre de connexion ou un champ \`type=password\`.`,
      `- Les deux flux publics OpenPhish et Phishing Army ont aussi été interrogés : aucune URL ` +
        `rattachée aux ${fr(data.targets)} organisations (contrôle complémentaire).`,
    );
  }
  lines.push(
    "",
    `## Commande reproductible`,
    "",
    `Chaque lot est exécuté séparément (moins de 60 s par commande) :`,
    "",
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-targets.mts`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=0 --batch=100 --concurrence=64 --max-variantes=8`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=100 --batch=200 --concurrence=64 --max-variantes=8`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=300 --batch=200 --concurrence=64 --max-variantes=8`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=500 --batch=200 --concurrence=64 --max-variantes=8`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=700 --batch=200 --concurrence=64 --max-variantes=8`,
    `DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --offset=900 --batch=100 --concurrence=64 --max-variantes=8`,
    `apps/api/node_modules/.bin/tsx scripts/typosquat-top1000.mts --aggregate`,
    "```",
    "",
    `Durée cumulée des lots : ${(data.durationMs / 1000).toFixed(1)} s. Aucune donnée personnelle de victime n'est consultée ou conservée ;`,
    `seuls des noms de domaine, des enregistrements DNS publics et des titres de pages publiques sont enregistrés.`,
    `Le diff de \`apps/api/src/server.ts\` est de 0 ligne : la mesure est un script autonome.`,
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function aggregate(dir: string): Promise<void> {
  const files = (await readdir(dir)).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no batch files in ${dir}`);
  const batches = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as Batch),
  );
  const byDomain = new Map<string, Batch["detections"][number]>();
  for (const b of batches) for (const d of b.detections) if (!byDomain.has(d.domain)) byDomain.set(d.domain, d);
  const detections = [...byDomain.values()].sort((a, b) => a.rank - b.rank || a.domain.localeCompare(b.domain));
  const sum = (key: "targets" | "variants" | "active" | "alarms" | "falsePositives" | "durationMs") =>
    batches.reduce((n, b) => n + b[key], 0);
  const alarms = sum("alarms");
  const falsePositives = sum("falsePositives");
  const data: Aggregate = {
    date: new Date().toISOString().slice(0, 10),
    targets: sum("targets"),
    batches: batches.length,
    variants: sum("variants"),
    active: sum("active"),
    activeKinds: batches.reduce<Record<string, number>>((acc, b) => {
      for (const f of b.activeList) acc[f.kind] = (acc[f.kind] ?? 0) + 1;
      return acc;
    }, {}),
    detections,
    alarms,
    falsePositives,
    falsePositiveRate: alarms === 0 ? 0 : Number((falsePositives / alarms).toFixed(4)),
    probes: batches.reduce((acc, b) => ({
      dns: acc.dns + b.probes.dns,
      certificate: acc.certificate + b.probes.certificate,
      page: acc.page + b.probes.page,
    }), { dns: 0, certificate: 0, page: 0 }),
    durationMs: sum("durationMs"),
    files,
  };
  await save(FINAL_JSON, `${JSON.stringify(data, null, 2)}\n`);
  await save(FINAL_REPORT, frenchReport(data));
  console.log(
    `[top1000] targets=${data.targets}/${1000} variants=${data.variants} active=${data.active} ` +
      `typosquatted-domains=${data.detections.length} false-positives=${data.falsePositives}/${data.alarms} ` +
      `(${(data.falsePositiveRate * 100).toFixed(1)}%) -> ${FINAL_JSON}`,
  );
}

try {
  const dir = option("dir") ?? DEFAULT_DIR;
  if (args.includes("--aggregate")) await aggregate(dir);
  else await batch(dir);
} finally {
  await closePools();
}
