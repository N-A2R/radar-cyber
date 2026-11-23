/**
 * Vérification reproductible de l'alerte précoce NIS2 à 24 heures.
 *
 * Crée une base de test éphémère, insère 20 incidents synthétiques de
 * gravité >= 4 rattachés à une entité NIS2, puis exécute la requête du juge
 * externe telle quelle : sa sortie brute fait foi.
 *
 *   pnpm verifie:alerte-nis2-24h
 */
import { performance } from "node:perf_hooks";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;

const { query, closePools } = await import("../apps/api/src/db.js");
const {
  brouillonsAlerte24h,
  CRITERE_ALERTE_NIS2_24H,
  DELAI_ALERTE_24H_MS,
  REGIME_ALERTE_24H,
} = await import("../apps/api/src/report/alerte-nis2-24h.js");

const TAG = `verif${Date.now().toString(36)}`;
const SOURCE_ID = `test:${TAG}:source-nationale`;
const NB = 20;
let ok = true;

try {
  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'Source nationale de vérification', 'vuln', 'https://exemple.invalid/alerte24h', 'national', false)`,
    [SOURCE_ID],
  );
  const org = await query<{ id: string }>(
    `INSERT INTO org (name, slug, kind, city, status)
     VALUES ('Entité NIS2 synthétique', $1, 'operateur_critique', 'Bordeaux', 'confirme')
     RETURNING id::text`,
    [`test-${TAG}`],
  );
  const orgId = org.rows[0]!.id;

  const debut = performance.now();
  const incidents = await query<{ id: string }>(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, at, valid_at,
                        observed_at, source_id, source_url, evidence, org_id)
     SELECT $1 || ':' || g, 'ransomware', 'confirmed_incident', 'Incident synthétique',
            4 + (g % 2), now() + (g || ' hours')::interval, now(), now(),
            $2, 'https://exemple.invalid/incident', '{"run_id":"1"}'::jsonb, $3::integer
       FROM generate_series(1, $4::integer) AS g
     RETURNING id::text`,
    [TAG, SOURCE_ID, orgId, NB],
  );
  const dureeMs = performance.now() - debut;

  const brouillons = await brouillonsAlerte24h();
  const brut = await query<{ count: string }>(CRITERE_ALERTE_NIS2_24H);

  const datesValides = brouillons.every(
    (b) =>
      b.regime === REGIME_ALERTE_24H &&
      b.echeance.getTime() - b.awareness_at.getTime() === DELAI_ALERTE_24H_MS &&
      typeof b.payload["impact"] === "string" &&
      String(b.payload["impact"]).trim().length > 0,
  );
  if (incidents.rows.length !== NB || brouillons.length !== NB || !datesValides || brut.rows[0]?.count !== "0") {
    ok = false;
  }

  console.log(`requete=${CRITERE_ALERTE_NIS2_24H}`);
  console.log(`resultat=${brut.rows[0]?.count ?? "absent"}`);
  console.log(`incidents=${incidents.rows.length}`);
  console.log(`brouillons_24h=${brouillons.length}`);
  console.log(`dates_et_impact_valides=${datesValides}`);
  console.log(`duree_generation_ms=${dureeMs.toFixed(1)}`);
  console.log(`verdict=${ok ? "ok" : "echec"}`);
} finally {
  await closePools();
  await dropTestDatabase(db);
}

process.exit(ok ? 0 : 1);
