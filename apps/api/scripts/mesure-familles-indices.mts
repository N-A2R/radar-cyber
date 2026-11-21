/**
 * Mesure avant/après du rattachement des familles domaine et sigle sur les
 * indices réels de `quarantine_raw`.
 *
 *  - avant : moteur livré. Pour un indice-domaine, `matchOrgInIndex` s'arrête
 *    à `resoudreDomaine` (exact/racine/revue) : on appelle donc directement
 *    cette chaîne sur les mêmes organisations. Pour un sigle, le moteur ne
 *    consulte pas l'index sans `PRECISION_RULES` : on appelle
 *    `matchOrgInIndex` avec son préfiltre usuel (nom uniquement, pas de regex
 *    coûteuse sur `org.domain`, absent d'un indice sigle).
 *  - après : `rattacherIndice` et ses deux index construits depuis le registre.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx apps/api/scripts/mesure-familles-indices.mts
 */
import { query } from "../src/db.js";
import { resoudreDomaine, type OrgDomaine } from "../src/match/domaine.js";
import { buildIndexFamilles, classifierIndice, rattacherIndice, type OrgFamille } from "../src/match/famille-indice.js";
import { SQL_INDEX_SIGLES, type LigneAliasSigle } from "../src/match/sigles.js";
import { loadCandidateIndex, matchOrgInIndex } from "../src/quarantine/promote.js";

delete process.env.PRECISION_RULES; // régime livré : index sigle non consulté

type Hint = { hint: string; n: number; famille: string };
type Stat = { total: number; avant: number; apres: number; union: number };

const r = await query<{ org_hint: string; n: string }>(`
  SELECT btrim(org_hint) AS org_hint, count(*)::text AS n
  FROM quarantine_raw
  WHERE org_hint IS NOT NULL AND btrim(org_hint) <> ''
  GROUP BY 1`);
const hints: Hint[] = r.rows.map((row) => ({
  hint: row.org_hint,
  n: Number(row.n),
  famille: classifierIndice(row.org_hint),
}));
const lignes = hints.reduce((s, h) => s + h.n, 0);
console.error(`file : ${hints.length} indices distincts, ${lignes} lignes`);

const [orgs, aliasDomaines, sigles] = await Promise.all([
  query<OrgDomaine>(`
    SELECT id, name, slug, domain, website FROM org
    WHERE (domain IS NOT NULL AND btrim(domain) <> '') OR (website IS NOT NULL AND btrim(website) <> '')`),
  query<OrgDomaine & { alias: string }>(`
    SELECT o.id, o.name, o.slug, o.domain, o.website, a.alias
    FROM org_alias a JOIN org o ON o.id = a.org_id
    WHERE a.source = 'domain' AND a.status = 'active' AND a.valid_to IS NULL`),
  query<LigneAliasSigle>(SQL_INDEX_SIGLES),
]);
const parId = new Map<number, OrgDomaine>();
for (const o of orgs.rows) parId.set(o.id, { ...o });
for (const o of aliasDomaines.rows) {
  const e = parId.get(o.id) ?? { id: o.id, name: o.name, slug: o.slug, domain: o.domain, website: o.website };
  (e.domainAliases ??= []).push(o.alias);
  parId.set(o.id, e);
}
const organisations = [...parId.values()];
const index = buildIndexFamilles(organisations as readonly OrgFamille[], sigles.rows);
console.error(`registre : ${organisations.length} organisations à domaine, ${sigles.rows.length} alias sigle`);

const stats: Record<string, Stat> = {};
function compte(famille: string, avant: boolean, apres: boolean, n: number): void {
  const s = (stats[famille] ??= { total: 0, avant: 0, apres: 0, union: 0 });
  s.total += n;
  if (avant) s.avant += n;
  if (apres) s.apres += n;
  if (avant || apres) s.union += n;
}

const evalues: Array<{ h: Hint; avant: boolean; orgIdAvant: number | null }> = [];
for (const h of hints) {
  if (h.famille !== "domaine" && h.famille !== "sigle") continue;
  let avant = false;
  let orgIdAvant: number | null = null;
  if (h.famille === "domaine") {
    const resolution = resoudreDomaine(h.hint, organisations);
    avant = resolution.etape === "exact" || resolution.etape === "racine";
    orgIdAvant = resolution.orgId ?? null;
  } else {
    const m = matchOrgInIndex(h.hint, await loadCandidateIndex(h.hint));
    avant = m !== null;
    orgIdAvant = m?.orgId ?? null;
  }
  evalues.push({ h, avant, orgIdAvant });
}

// Le département de l'organisation proposée par le moteur est le contexte
// que la promotion fournit au désambiguage des sigles.
const ids = [...new Set(evalues.map((e) => e.orgIdAvant).filter((id): id is number => id !== null))];
const depts = await query<{ id: number; dept: string | null }>(
  "SELECT id, dept FROM org WHERE id = ANY($1::int[])", [ids],
);
const deptParId = new Map(depts.rows.map((r) => [Number(r.id), r.dept]));
for (const { h, avant, orgIdAvant } of evalues) {
  const dept = orgIdAvant === null ? null : deptParId.get(orgIdAvant) ?? null;
  const apres = rattacherIndice(h.hint, index, dept ? { dept } : undefined).accepte;
  compte(h.famille, avant, apres, h.n);
  compte("cible", avant, apres, h.n);
}

const taux = (s: Stat | undefined) => ({
  lignes: s?.total ?? 0,
  avant: s?.avant ?? 0,
  apres: s?.apres ?? 0,
  tauxAvant: s?.total ? +(100 * s.avant / s.total).toFixed(2) : 0,
  tauxApres: s?.total ? +(100 * s.apres / s.total).toFixed(2) : 0,
  union: s?.union ?? 0,
  tauxUnion: s?.total ? +(100 * s.union / s.total).toFixed(2) : 0,
});
console.log(JSON.stringify({
  source: "quarantine_raw.org_hint",
  familles: hints.reduce<Record<string, number>>((acc, h) => {
    acc[h.famille] = (acc[h.famille] ?? 0) + h.n;
    return acc;
  }, {}),
  mesure: {
    domaine: taux(stats.domaine),
    sigle: taux(stats.sigle),
    domaineEtSigle: taux(stats.cible),
  },
}, null, 2));
