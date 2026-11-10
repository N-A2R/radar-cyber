#!/usr/bin/env -S npx tsx
/**
 * Import d'organisations depuis l'API recherche-entreprises.api.gouv.fr
 * (pas de clé requise). Cible : Nouvelle-Aquitaine (départements 16,17,19,23,
 * 24,33,40,47,64,79,86,87) et secteurs d'intérêt (santé, collectivités,
 * enseignement, opérateurs critiques).
 *
 * Usage :
 *   pnpm exec tsx scripts/sirene-import.mts [--dry-run] [--apply] [--per-dept=N] [--limit=N]
 *
 *   --dry-run    (défaut) affiche un aperçu, aucune écriture
 *   --apply      écrit en base (ON CONFLICT (slug) DO NOTHING)
 *   --per-dept=N nombre max d'orgs importées par département (défaut 100)
 *   --limit=N    plafond global (surclasse per-dept si atteint)
 */
import { ingestQuery, closePools } from "../apps/api/src/db.js";

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply || args.includes("--dry-run");

function numArg(name: string): number | undefined {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  if (!a) return undefined;
  const n = Number(a.slice(`--${name}=`.length));
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`--${name} invalide`);
    process.exit(1);
  }
  return n;
}

const perDept = numArg("per-dept") ?? 100;
const globalLimit = numArg("limit");

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function kindFromNaf(naf: string | null | undefined): string {
  const c = (naf ?? "").slice(0, 2);
  if (c === "86") return "sante";
  if (c === "85") return "enseignement";
  if (c === "84") return "collectivite";
  if (["35", "49", "50", "51", "52", "61", "62", "63"].includes(c)) return "opérateur critique";
  return "entreprise";
}

interface ApiResult {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string | null;
  siege: {
    activite_principale: string | null;
    code_postal: string | null;
    commune: string | null;
    libelle_commune: string | null;
    adresse: string | null;
    coordonnees: string | null;
  };
}

async function fetchDept(dept: string, cap: number): Promise<ApiResult[]> {
  const out: ApiResult[] = [];
  let page = 1;
  // NAf d'intérêt : on parcourt toutes les pages mais on filtre client-side.
  // On limite le nombre de pages pour éviter les 10k résultats.
  const maxPages = 20;
  while (out.length < cap && page <= maxPages) {
    const url = `https://recherche-entreprises.api.gouv.fr/search?departement=${dept}&page=${page}&per_page=25`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HTTP ${res.status} pour ${url}`);
      break;
    }
    const data = (await res.json()) as { results: ApiResult[]; total_pages: number };
    if (!data.results || data.results.length === 0) break;
    for (const r of data.results) {
      if (out.length >= cap) break;
      const naf = r.siege?.activite_principale ?? null;
      // Ne garder que les secteurs d'intérêt
      const prefix = (naf ?? "").slice(0, 2);
      const interesting = ["86", "85", "84", "35", "49", "50", "51", "52", "61", "62", "63"].includes(prefix);
      if (!interesting) continue;
      out.push(r);
    }
    if (page >= data.total_pages) break;
    page++;
  }
  return out;
}

function cityFrom(r: ApiResult): string {
  // libelle_commune pas toujours fourni ; on garde le code commune sinon
  return r.siege?.libelle_commune ?? r.siege?.commune ?? "";
}

async function main(): Promise<void> {
  console.log(dryRun ? "DRY-RUN : aucune écriture" : "APPLY : écriture en base");
  let totalImported = 0;
  let totalSkipped = 0;
  const preview: { name: string; kind: string; city: string; dept: string }[] = [];

  for (const dept of DEPTS) {
    if (globalLimit !== undefined && totalImported >= globalLimit) break;
    const cap = globalLimit !== undefined ? Math.min(perDept, globalLimit - totalImported) : perDept;
    const rows = await fetchDept(dept, cap);
    console.log(`dept ${dept} : ${rows.length} candidat(s)`);

    for (const r of rows) {
      if (globalLimit !== undefined && totalImported >= globalLimit) break;
      const name = r.nom_raison_sociale || r.nom_complet;
      const slug = slugify(name);
      if (!slug) continue;
      const kind = kindFromNaf(r.siege?.activite_principale);
      const city = cityFrom(r);
      const website: string | null = null; // recherche-entreprises ne fournit pas de site web
      const domain: string | null = null;

      preview.push({ name, kind, city, dept });

      if (!dryRun) {
        const { rowCount } = await ingestQuery(
          `INSERT INTO org (name, slug, kind, sector, city, dept, website, domain, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirme')
           ON CONFLICT (slug) DO NOTHING`,
          [name, slug, kind, null, city || null, dept, website, domain],
        );
        if (rowCount && rowCount > 0) totalImported++;
        else totalSkipped++;
      } else {
        totalImported++;
      }
    }
  }

  console.log(`\naperçu (${Math.min(preview.length, 20)} premiers) :`);
  for (const p of preview.slice(0, 20)) {
    console.log(`  - ${p.name} [${p.kind}] ${p.city} (${p.dept})`);
  }
  console.log(`\nbilan : ${totalImported} org(s) ${dryRun ? "à importer" : "importée(s)"}, ${totalSkipped} ignorée(s) (slug déjà présent)`);
  console.log("lat/lng non renseignés : relancer `pnpm exec tsx scripts/geocode-orgs.mts` pour géocoder.");
}

try {
  await main();
} finally {
  await closePools();
}
process.exit(0);