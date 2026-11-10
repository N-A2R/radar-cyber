#!/usr/bin/env -S npx tsx
/**
 * Import organisations SIRENE (recherche-entreprises.api.gouv.fr, sans clé).
 * Source publique DINUM/Etalab : https://recherche-entreprises.api.gouv.fr/search
 *
 * Usage:
 *   npx tsx scripts/import-sirene.mts [--apply] [--dept=33,64,...] [--per-naf=50] [--max-pages=10]
 *
 * --dry-run (défaut) : aucune écriture, rapporte lues/retenues/nouvelles/déjà présentes/rejetées.
 * --apply            : insertion idempotente des nouvelles orgs.
 * --dept=33,64       : départements ciblés (défaut: 12 de Nouvelle-Aquitaine).
 * --per-naf=N        : plafond retenu par (dept, code NAF) (défaut 50).
 * --max-pages=N      : pages max par requête API (25 résultats/page, défaut 10).
 */
import { closePools, ingestQuery } from "../apps/api/src/db.js";

const DEFAULT_DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";

type NafRule = { code: string; kind: string; label: string };

// Codes NAF pertinents pour une veille cyber (établissements avec SI critiques/publics exposés).
const NAF_RULES: NafRule[] = [
  { code: "62.02A", kind: "operateur-critique", label: "Conseil en systèmes et logiciels informatiques" },
  { code: "62.09Z", kind: "operateur-critique", label: "Autres activités informatiques" },
  { code: "61.10Z", kind: "operateur-critique", label: "Télécommunications filaires" },
  { code: "63.11Z", kind: "operateur-critique", label: "Hébergement / traitement de données" },
  { code: "84.11Z", kind: "collectivite", label: "Administration publique générale" },
  { code: "84.12Z", kind: "collectivite", label: "Administration de la santé, enseignement, culture, etc." },
  { code: "84.13Z", kind: "collectivite", label: "Administration des affaires économiques" },
  { code: "84.30A", kind: "collectivite", label: "Activités générales de sécurité sociale" },
  { code: "84.30B", kind: "collectivite", label: "Gestion des retraites complémentaires" },
  { code: "84.30C", kind: "collectivite", label: "Distribution sociale de revenus" },
  { code: "85.42Z", kind: "enseignement", label: "Enseignement supérieur" },
  { code: "85.20Z", kind: "enseignement", label: "Enseignement primaire" },
  { code: "85.31Z", kind: "enseignement", label: "Enseignement secondaire général" },
  { code: "85.32Z", kind: "enseignement", label: "Enseignement secondaire technique/professionnel" },
  { code: "86.10Z", kind: "sante", label: "Activités hospitalières" },
  { code: "86.21Z", kind: "sante", label: "Activité des médecins généralistes" },
  { code: "86.22A", kind: "sante", label: "Activité de radiodiagnostic / radiothérapie" },
  { code: "86.22B", kind: "sante", label: "Activités chirurgicales" },
  { code: "86.22C", kind: "sante", label: "Autres activités des médecins spécialistes" },
];

interface ApiSiege {
  activite_principale: string | null;
  code_postal: string | null;
  commune: string | null;
  libelle_commune: string | null;
  adresse: string | null;
  departement: string | null;
}

interface ApiResult {
  siren: string;
  nom_complet: string;
  nom_raison_sociale: string | null;
  siege: ApiSiege;
}

interface ApiResponse {
  results?: ApiResult[];
  total_results?: number;
  total_pages?: number;
  page?: number;
  per_page?: number;
}

interface Stats {
  lues: number;
  retenues: number;
  nouvelles: number;
  deja_presentes: number;
  rejetees_filtre: number;
  rejetees_sans_nom: number;
  par_naf: Record<string, number>;
}

function argVal(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

function argNum(name: string, fallback: number): number {
  const v = argVal(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} invalide: ${v}`);
  return n;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchNaf(dept: string, naf: string, maxPages: number): Promise<ApiResult[]> {
  const out: ApiResult[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${API_BASE}?departement=${encodeURIComponent(dept)}&activite_principale=${encodeURIComponent(naf)}&page=${page}&per_page=25`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      console.error(`fetch error ${url}:`, e);
      break;
    }
    if (res.status === 429) {
      await sleep(1500);
      page--;
      continue;
    }
    if (!res.ok) {
      console.error(`HTTP ${res.status} ${url}`);
      break;
    }
    const data = (await res.json()) as ApiResponse;
    const results = data.results ?? [];
    for (const r of results) out.push(r);
    const totalPages = data.total_pages ?? page;
    if (results.length === 0 || page >= totalPages) break;
    await sleep(120);
  }
  return out;
}

async function existingMaps(): Promise<{ slugs: Set<string>; names: Set<string> }> {
  const slugs = new Set<string>();
  const names = new Set<string>();
  const { rows } = await ingestQuery<{ slug: string; norm: string }>(
    `SELECT slug, regexp_replace(lower(translate(name,
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
      'aaaaaaceeeeiiiinooooouuuuyyoa')), '[^a-z0-9]+', ' ', 'g') AS norm
     FROM org`,
  );
  for (const r of rows) {
    if (r.slug) slugs.add(r.slug);
    if (r.norm) names.add(r.norm.replace(/\s+/g, " ").trim());
  }
  return { slugs, names };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = !apply || args.includes("--dry-run");
  const deptsArg = argVal("dept");
  const depts = deptsArg ? deptsArg.split(",").map((d) => d.trim()).filter(Boolean) : DEFAULT_DEPTS;
  const perNaf = argNum("per-naf", 50);
  const maxPages = argNum("max-pages", 10);

  const stats: Stats = {
    lues: 0, retenues: 0, nouvelles: 0, deja_presentes: 0,
    rejetees_filtre: 0, rejetees_sans_nom: 0, par_naf: {},
  };

  const existing = await existingMaps();
  const seenSlugs = new Set<string>();
  const seenNames = new Set<string>();

  console.log(dryRun ? "MODE: --dry-run (aucune écriture)" : "MODE: --apply (écriture idempotente)");
  console.log(`Départements: ${depts.join(",")} | per-naf=${perNaf} | max-pages=${maxPages}`);
  console.log(`NAF ciblés: ${NAF_RULES.map((r) => r.code).join(", ")}`);

  for (const dept of depts) {
    console.log(`\n== Département ${dept} ==`);
    for (const rule of NAF_RULES) {
      const rows = await fetchNaf(dept, rule.code, maxPages);
      stats.lues += rows.length;
      let keptForNaf = 0;

      for (const r of rows) {
        if (keptForNaf >= perNaf) break;
        const name = (r.nom_raison_sociale || r.nom_complet || "").trim();
        if (!name) {
          stats.rejetees_sans_nom++;
          continue;
        }
        const naf = (r.siege?.activite_principale ?? "").trim();
        if (naf !== rule.code) {
          stats.rejetees_filtre++;
          continue;
        }
        keptForNaf++;
        stats.retenues++;
        stats.par_naf[rule.code] = (stats.par_naf[rule.code] ?? 0) + 1;

        const slug = slugify(name);
        const nname = normName(name);
        if (!slug) {
          stats.rejetees_sans_nom++;
          continue;
        }

        const dupExisting = existing.slugs.has(slug) || existing.names.has(nname);
        const dupSeen = seenSlugs.has(slug) || seenNames.has(nname);
        if (dupExisting || dupSeen) {
          stats.deja_presentes++;
          continue;
        }
        seenSlugs.add(slug);
        seenNames.add(nname);

        const city = (r.siege?.libelle_commune ?? r.siege?.commune ?? "").trim() || null;
        const cp = (r.siege?.code_postal ?? "").trim() || null;
        const cityLabel = city ?? (cp ? `CP ${cp}` : null);

        if (!dryRun) {
          const { rowCount } = await ingestQuery(
            `INSERT INTO org (name, slug, kind, sector, city, dept, website, domain, status)
             SELECT $1,$2,$3,$4,$5,$6,$7,$8,'confirme'
             WHERE NOT EXISTS (
               SELECT 1 FROM org
               WHERE slug = $2
                  OR regexp_replace(lower(translate(name,
                       'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                       'aaaaaaceeeeiiiinooooouuuuyyoa')), '[^a-z0-9]+', ' ', 'g') = $9
             )`,
            [name, slug, rule.kind, rule.code, cityLabel, dept, null, null, nname],
          );
          if (rowCount && rowCount > 0) {
            stats.nouvelles++;
            existing.slugs.add(slug);
            existing.names.add(nname);
          } else {
            stats.deja_presentes++;
          }
        } else {
          stats.nouvelles++;
        }
      }
      if (rows.length > 0) {
        console.log(`  ${rule.code} ${rule.kind}: lues=${rows.length} retenues=${keptForNaf}`);
      }
    }
  }

  console.log("\n== Rapport ==");
  console.log(`lues            : ${stats.lues}`);
  console.log(`retenues        : ${stats.retenues}`);
  console.log(`nouvelles       : ${stats.nouvelles}`);
  console.log(`déjà présentes  : ${stats.deja_presentes}`);
  console.log(`rejetées filtre : ${stats.rejetees_filtre}`);
  console.log(`rejetées sans nom: ${stats.rejetees_sans_nom}`);
  console.log("par NAF retenu  :", JSON.stringify(stats.par_naf));
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await closePools();
}
process.exit(process.exitCode ?? 0);
