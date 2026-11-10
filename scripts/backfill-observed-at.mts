/**
 * Renseigne `event.observed_at` pour les événements qui n'ont aucune date
 * d'observation, et trace la règle appliquée dans `event.observed_at_source`.
 *
 * Constat mesuré (2026-11-10) : 2 100 événements sur 7 251 n'ont pas de
 * `observed_at`, tous de la famille `vuln`, issus de deux flux NVD/EPSS dont
 * le titre est un identifiant `CVE-AAAA-NNNN`. Leur `summary` est vide, leur
 * `evidence` ne contient que le nom du flux (aucune date), et seuls 100
 * portent une `source_url` (sans date). La seule information de date
 * exploitable est donc l'année du CVE.
 *
 * Règles, par ordre de préférence (une seule règle par événement) :
 *   1. `evidence-iso`  : date ISO `AAAA-MM-JJ` dans `evidence` (valide au calendrier).
 *   2. `summary-iso`   : date ISO `AAAA-MM-JJ` dans `summary`.
 *   3. `year-only`     : année seule dans le titre (`CVE-2000-0564`). La colonne
 *                        `observed_at` reste NULL : poser un 1er janvier serait
 *                        une invention. Seule la provenance est écrite.
 *   4. `collected`     : à défaut, `collected_at`, marqué comme tel.
 *
 * Garanties :
 *   - `--dry-run` par défaut, aucun écrire.
 *   - `--apply` : colonne `observed_at_source` ajoutée si absente, puis une
 *     seule transaction ; chaque ligne écrite est gardée par
 *     `observed_at IS NULL AND observed_at_source IS NULL`, donc aucune date
 *     ni provenance existante n'est jamais écrasée.
 *
 * Usage : pnpm exec tsx scripts/backfill-observed-at.mts [--apply]
 */
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const APPLY = process.argv.includes("--apply");

/** Même intention que `\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b` ; Postgres utilise `\m` / `\M` pour les frontières de mot. */
const ISO_RE = String.raw`\m(20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\M`;
/** Année seule : CVE-2000-0564, publié en 2000 (les CVE des années 1990 existent aussi). */
const YEAR_RE = String.raw`\m(19|20)[0-9]{2}\M`;

const CLASSIFY = `
WITH base AS (
  SELECT e.id,
         e.title,
         e.collected_at,
         coalesce(e.evidence::text, '') AS ev_text,
         coalesce(e.summary, '') AS sum_text
  FROM event e
  WHERE e.observed_at IS NULL
),
matched AS (
  SELECT id, title, collected_at,
         regexp_match(ev_text, $1) AS ev_m,
         regexp_match(sum_text, $1) AS sum_m
  FROM base
),
picked AS (
  SELECT id, title, collected_at,
         CASE WHEN ev_m IS NOT NULL THEN ev_m ELSE sum_m END AS m,
         CASE WHEN ev_m IS NOT NULL THEN 'evidence-iso' ELSE 'summary-iso' END AS iso_rule
  FROM matched
),
dated AS (
  SELECT id, title, collected_at, iso_rule,
         CASE
           WHEN m IS NULL THEN NULL
           WHEN m[3]::int <= extract(day FROM (make_date(m[1]::int, m[2]::int, 1) + interval '1 month - 1 day'))::int
             THEN make_date(m[1]::int, m[2]::int, m[3]::int)
         END AS iso_date
  FROM picked
)
SELECT id, title,
       CASE
         WHEN iso_date IS NOT NULL THEN iso_rule
         WHEN title ~ $2 THEN 'year-only'
         ELSE 'collected'
       END AS rule,
       CASE
         WHEN iso_date IS NOT NULL THEN iso_date
         WHEN title ~ $2 THEN NULL
         ELSE collected_at
       END AS new_date
FROM dated`;

type CountRow = { rule: string; n: number; earliest: string | null; latest: string | null };
type SampleRow = { id: string; title: string; rule: string; new_date: string | null };

const pool = new Pool({ connectionString: DATABASE_URL });

async function columnExists(): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'event' AND column_name = 'observed_at_source'
     ) AS exists`,
  );
  return rows[0]?.exists === true;
}

async function report(): Promise<void> {
  const counts = await pool.query<CountRow>(
    `WITH classified AS (${CLASSIFY})
     SELECT rule, count(*)::int AS n,
            min(new_date)::text AS earliest,
            max(new_date)::text AS latest
     FROM classified
     GROUP BY rule
     ORDER BY n DESC`,
    [ISO_RE, YEAR_RE],
  );
  const samples = await pool.query<SampleRow>(
    `WITH classified AS (${CLASSIFY})
     SELECT id::text, title, rule, new_date::text
     FROM classified
     ORDER BY (rule = 'year-only'), id
     LIMIT 5`,
    [ISO_RE, YEAR_RE],
  );

  const total = counts.rows.reduce((sum, r) => sum + r.n, 0);
  console.log(`Événements sans observed_at : ${total}`);
  for (const row of counts.rows) {
    const range = row.earliest === null ? "date laissée NULL" : `${row.earliest} → ${row.latest}`;
    console.log(`  ${row.rule.padEnd(12)} ${String(row.n).padStart(6)}  (${range})`);
  }
  console.log("\nExemples:");
  for (const row of samples.rows) {
    console.log(`  #${row.id} ${row.rule.padEnd(12)} ${row.new_date ?? "NULL"}  ${row.title}`);
  }
}

async function apply(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE event ADD COLUMN IF NOT EXISTS observed_at_source text");

    const { rows } = await client.query<{ rule: string; n: number }>(
      `WITH classified AS (${CLASSIFY}),
       updated AS (
         UPDATE event e
         SET observed_at = c.new_date, observed_at_source = c.rule
         FROM classified c
         WHERE e.id = c.id
           AND e.observed_at IS NULL
           AND e.observed_at_source IS NULL
         RETURNING c.rule
       )
       SELECT rule, count(*)::int AS n FROM updated GROUP BY rule ORDER BY n DESC`,
      [ISO_RE, YEAR_RE],
    );

    await client.query("COMMIT");
    const written = rows.reduce((sum, r) => sum + r.n, 0);
    console.log(`Écrit : ${written} ligne(s).`);
    for (const row of rows) console.log(`  ${row.rule.padEnd(12)} ${String(row.n).padStart(6)}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  const hasColumn = await columnExists();
  console.log(`observed_at_source : ${hasColumn ? "présente" : "absente"}`);
  if (APPLY) {
    await apply();
    console.log("\nÉtat après écriture :");
  } else {
    console.log("Mode --dry-run (aucune écriture). Ajouter --apply pour écrire.\n");
  }
  await report();
} finally {
  await pool.end();
}
