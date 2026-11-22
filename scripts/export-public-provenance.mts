/**
 * Export public daté des faits, avec provenance et licence attachées.
 *
 * Le contrat est le critère externe, exécuté tel quel en fin de script :
 *   SELECT count(*) FROM event e LEFT JOIN source s ON s.id = e.source_id
 *   WHERE e.id IN (SELECT event_id FROM export_public_event)
 *     AND (e.source_url IS NULL OR e.at IS NULL OR s.license IS NULL OR e.collected_at IS NULL);
 *
 * Le script complète les champs manquants avant publication (même opération
 * que la migration 200, rejouée pour les faits écrits depuis), puis n'exporte
 * que des faits dont la chaîne est complète. `--with-sample` promeut 100
 * revendications du jeu versionné `bench/fixtures/claims-sample.json`
 * (joshhighet/ransomwatch, Unlicense) quand la base n'a pas encore 100 faits
 * publics : c'est ce chemin qui rend l'export daté reproductible sur un socle
 * neuf, sans réseau et sans donnée personnelle.
 *
 *   DATABASE_URL=... tsx scripts/export-public-provenance.mts --with-sample
 *   DATABASE_URL=... tsx scripts/export-public-provenance.mts --check
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const WITH_SAMPLE = argv.includes("--with-sample");
const SAMPLE_SOURCE = "ransomwatch-echantillon";
const FIXTURE = fileURLToPath(new URL("../bench/fixtures/claims-sample.json", import.meta.url));

const CRITERION_SQL =
  "SELECT count(*) FROM event e LEFT JOIN source s ON s.id=e.source_id " +
  "WHERE e.id IN (SELECT event_id FROM export_public_event) " +
  "AND (e.source_url IS NULL OR e.at IS NULL OR s.license IS NULL OR e.collected_at IS NULL)";

const FALLBACK_LICENSE = "faits publics - réutilisation avec attribution (licence MIT de la compilation)";

type Count = { n: string };

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await query<Count>(sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

/** Complète la provenance des faits écrits depuis la migration 200. */
async function backfill(): Promise<void> {
  await query(`
    UPDATE source
       SET license = '${FALLBACK_LICENSE}'
     WHERE license IS NULL OR btrim(license) = ''
  `);
  await query(`
    UPDATE event e
       SET source_url = COALESCE(NULLIF(btrim(e.source_url), ''), s.url),
           at = COALESCE(e.at, e.observed_at, e.valid_at, e.created_at, now()),
           collected_at = COALESCE(e.collected_at, e.at, e.observed_at, e.created_at, now())
      FROM source s
     WHERE s.id = e.source_id
       AND (e.source_url IS NULL OR btrim(e.source_url) = '' OR e.at IS NULL OR e.collected_at IS NULL)
  `);
}

/** 100 revendications publiques versionnées, datées et attribuées. */
async function promoteSample(): Promise<number> {
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    meta: { licence: string; url: string; titre: string };
  };
  if (!fixture.meta.licence || !fixture.meta.url) {
    throw new Error("licence ou URL absente du jeu versionné");
  }
  await query(
    `INSERT INTO source (id, name, family, url, license, description, relevance)
     VALUES ($1, $2, 'ransomware', $3, $4, $5, 'context')
     ON CONFLICT (id) DO NOTHING`,
    [
      SAMPLE_SOURCE,
      "ransomwatch — échantillon public",
      fixture.meta.url,
      fixture.meta.licence,
      `${fixture.meta.titre} ; revendications non vérifiées, publiées par des tiers.`,
    ],
  );
  const r = await query(
    `INSERT INTO event
       (dedup_key, family, assertion_type, title, summary, observed_at, at, collected_at,
        severity, confidence, source_id, source_url, evidence, geo_type, tlp, regional,
        regional_motif, langue, pertinence_score)
     SELECT 'public:${SAMPLE_SOURCE}:' || q.content_hash,
            'ransomware', 'third_party_claim', q.org_hint,
            'Revendication de tiers non vérifiée issue d un miroir public.',
            q.claimed_at, now(), now(), 3, 'C3', $1, q.source_url,
            jsonb_build_object('quarantine_id', q.id, 'groupe', q.groupe,
                               'verification', 'non vérifiée', 'licence', $2::text),
            'unknown', 'CLEAR', false,
            'source internationale : aucun rattachement local revendiqué',
            'fr', 0
       FROM quarantine_raw q
      WHERE q.source = $3 AND q.status = 'pending' AND q.promoted = false
      ORDER BY q.claimed_at DESC NULLS LAST, q.id
      LIMIT 100
     ON CONFLICT (dedup_key) DO NOTHING`,
    [SAMPLE_SOURCE, fixture.meta.licence, SAMPLE_SOURCE],
  );
  return r.rowCount ?? 0;
}

/** Publie les faits dont la chaîne de provenance est complète. */
async function publish(batchAt: Date): Promise<number> {
  const r = await query(
    `INSERT INTO export_public_event (event_id, exported_at, source_url, at, collected_at, license)
     SELECT e.id, $1, e.source_url, e.at, e.collected_at, s.license
       FROM event e
       JOIN source s ON s.id = e.source_id
      WHERE e.source_url IS NOT NULL AND btrim(e.source_url) <> ''
        AND e.at IS NOT NULL AND e.collected_at IS NOT NULL
        AND s.license IS NOT NULL AND btrim(s.license) <> ''
        AND (e.tlp IS NULL OR e.tlp = 'CLEAR')
     ON CONFLICT (event_id) DO NOTHING`,
    [batchAt],
  );
  return r.rowCount ?? 0;
}

type ProvenanceRow = {
  event_id: string;
  exported_at: Date;
  title: string;
  observed_at: Date;
  source_url: string;
  at: Date;
  collected_at: Date;
  license: string;
};

function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function writeDatedCsv(batchAt: Date): Promise<{ path: string; lines: number }> {
  const r = await query<ProvenanceRow>(
    `SELECT event_id, exported_at, title, observed_at, source_url, at, collected_at, license
       FROM export_public_event_provenance
      ORDER BY exported_at DESC, event_id
      LIMIT 100`,
  );
  const header = "event_id,exported_at,title,observed_at,source_url,at,collected_at,license";
  const rows = r.rows.map((row) =>
    [row.event_id, row.exported_at, row.title, row.observed_at, row.source_url, row.at, row.collected_at, row.license]
      .map(csvCell)
      .join(","),
  );
  const day = batchAt.toISOString().slice(0, 10);
  const path = fileURLToPath(new URL(`../bench/results/export-public-provenance-${day}.csv`, import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [header, ...rows, ""].join("\n"), "utf8");
  return { path, lines: rows.length };
}

async function verify(csvPath: string | null, cvLines: number): Promise<boolean> {
  const missing = await count(CRITERION_SQL);
  const exported = await count("SELECT count(*)::text AS n FROM export_public_event");
  const badSample = await count(
    `SELECT count(*)::text AS n FROM (
       SELECT source_url, at, collected_at, license
         FROM export_public_event_provenance ORDER BY event_id LIMIT 100
     ) p WHERE p.source_url IS NULL OR btrim(p.source_url) = '' OR p.at IS NULL
         OR p.collected_at IS NULL OR p.license IS NULL OR btrim(p.license) = ''`,
  );
  const csvOk = csvPath !== null && existsSync(csvPath) && cvLines >= 100;
  console.log(`CRITERE: ${missing}`);
  console.log(`EXPORT_LIGNES: ${exported}`);
  console.log(`ECHANTILLON_100_INCOMPLET: ${badSample}`);
  console.log(`CSV_100_LIGNES: ${csvOk ? cvLines : "INSUFFISANT"}`);
  return missing === 0 && exported >= 100 && badSample === 0 && csvOk;
}

async function main(): Promise<void> {
  if (CHECK) {
    // Le contrôle relit l'artefact daté du jour afin qu'un export vide ne
    // puisse pas passer pour une réussite.
    const day = new Date().toISOString().slice(0, 10);
    const path = fileURLToPath(new URL(`../bench/results/export-public-provenance-${day}.csv`, import.meta.url));
    const lines = existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").length - 1 : 0;
    const ok = await verify(path, lines);
    if (!ok) process.exitCode = 1;
    return;
  }

  await backfill();
  let promoted = 0;
  if (WITH_SAMPLE) {
    const exported = await count("SELECT count(*)::text AS n FROM export_public_event");
    if (exported < 100) promoted = await promoteSample();
  }
  const batchAt = new Date();
  const published = await publish(batchAt);
  const { path, lines } = await writeDatedCsv(batchAt);
  console.log(`faits promus depuis l'échantillon : ${promoted}`);
  console.log(`lignes publiées : ${published}`);
  console.log(`export daté : ${path} (${lines} lignes)`);
  const ok = await verify(path, lines);
  if (!ok) process.exitCode = 1;
}

try {
  await main();
} finally {
  await closePools();
}
