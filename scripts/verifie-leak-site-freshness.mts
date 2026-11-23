/**
 * Vérifie l'objectif chiffré « fraîcheur des sites de fuite rançongiciel ».
 *
 *   pnpm verifie:leak-site-freshness
 *
 * Crée une base de test isolée depuis `db/init.sql` + `db/migrate-*.sql`,
 * puis exécute le critère de sortie. Aucune donnée de production n'est lue
 * ni écrite ; la base est détruite à la fin.
 *
 * Les deux formes littérales du critère —
 *   `harvested_at > now()-interval '24 hours' >= 8`
 *   `harvested_at > now()-interval '24 hours' >= 60`
 * — ne sont pas du SQL valide en PostgreSQL : deux opérateurs de comparaison
 * ne s'enchaînent pas. Le script imprime l'erreur brute, puis exécute les
 * lectures correctes et compare chaque résultat à son seuil.
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const SEUIL_SITES = 8;
const SEUIL_TAUX = 60;

function titre(texte: string): void {
  console.log(`\n== ${texte} ==`);
}

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
const { query, closePools } = await import("../apps/api/src/db.js");

let code = 1;
try {
  titre("Vue");
  const vue = await query<{ vue: string | null }>(
    "SELECT to_regclass('public.leak_site_freshness')::text AS vue",
  );
  console.log(`SQL> SELECT to_regclass('public.leak_site_freshness')::text`);
  console.log(`vue = ${vue.rows[0]?.vue ?? "absente"}`);
  const vueOk = ["leak_site_freshness", "public.leak_site_freshness"].includes(vue.rows[0]?.vue ?? "");

  const exemples = await query<{
    slug: string;
    http_status: number;
    interroge_24h: boolean;
    accessible_24h: boolean;
    etat: string;
  }>(
    `SELECT slug, http_status, interroge_24h, accessible_24h, etat
       FROM leak_site_freshness
      ORDER BY harvested_at DESC, slug
      LIMIT 5`,
  );
  for (const r of exemples.rows) {
    console.log(
      `${r.slug}  http=${r.http_status}  interroge_24h=${r.interroge_24h}  ` +
        `accessible_24h=${r.accessible_24h}  etat=${r.etat}`,
    );
  }

  titre("Critère brut, forme littérale");
  const littSites = "SELECT count(*) FROM leak_site WHERE harvested_at > now()-interval '24 hours' >= 8";
  const littTaux = "SELECT round(100.0*count(*) FILTER (WHERE http_status=200)/count(*)) FROM leak_site WHERE harvested_at > now()-interval '24 hours' >= 60";
  for (const sql of [littSites, littTaux]) {
    console.log(`SQL> ${sql}`);
    try {
      const { rows } = await query(sql);
      console.log(JSON.stringify(rows[0] ?? null));
    } catch (error) {
      console.log(`ERREUR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  titre("Critère corrigé (seuils appliqués aux résultats)");
  const sqlSites = "SELECT count(*) FROM leak_site WHERE harvested_at > now()-interval '24 hours'";
  const sqlTaux = "SELECT round(100.0*count(*) FILTER (WHERE http_status=200)/count(*)) FROM leak_site WHERE harvested_at > now()-interval '24 hours'";
  console.log(`SQL> ${sqlSites}`);
  const sites = await query<{ count: string }>(sqlSites);
  const nSites = Number(sites.rows[0]?.count ?? 0);
  console.log(` count\n-------\n${String(nSites).padStart(5)}\n(1 row)`);
  console.log(`SQL> ${sqlTaux}`);
  const taux = await query<{ round: string }>(sqlTaux);
  const nTaux = Number(taux.rows[0]?.round ?? 0);
  console.log(` round\n-------\n${String(nTaux).padStart(5)}\n(1 row)`);

  titre("Garde d'un site 403");
  await query(
    `INSERT INTO leak_site (source, slug, group_name, site_url, http_status, claim_count, harvested_at)
     VALUES ('ransomlook', 'garde-403-verification', 'Garde 403', NULL, 403, 0, now())
     ON CONFLICT (source, slug) DO UPDATE SET http_status = 403, harvested_at = now()`,
  );
  const garde = await query<{ http_status: number; interroge_24h: boolean; accessible_24h: boolean; etat: string }>(
    `SELECT http_status, interroge_24h, accessible_24h, etat
       FROM leak_site_freshness WHERE slug = 'garde-403-verification'`,
  );
  const g = garde.rows[0];
  console.log(
    `slug=garde-403-verification http=${g?.http_status} interroge_24h=${g?.interroge_24h} ` +
      `accessible_24h=${g?.accessible_24h} etat=${g?.etat}`,
  );
  const gardeOk = g?.http_status === 403 && g?.interroge_24h === true &&
    g?.accessible_24h === false && g?.etat === "bloque_403";

  titre("Objectif");
  const ok = vueOk &&
    nSites >= SEUIL_SITES && nTaux >= SEUIL_TAUX && gardeOk;
  if (ok) {
    console.log(
      `OBJECTIF : atteint — ${nSites} sites interrogés sur 24 h, ${nTaux} % de HTTP 200, ` +
        `site 403 visible et non compté / ${SEUIL_SITES} sites, ${SEUIL_TAUX} %, garde 403`,
    );
    code = 0;
  } else {
    console.log(
      `OBJECTIF : partiel — ${nSites} sites interrogés sur 24 h, ${nTaux} % de HTTP 200, ` +
        `garde 403 ${gardeOk ? "ok" : "échec"} / ${SEUIL_SITES} sites, ${SEUIL_TAUX} %, garde 403`,
    );
  }
} finally {
  await closePools().catch(() => {});
  await dropTestDatabase(db);
}
process.exit(code);
