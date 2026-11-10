/**
 * Purge des CVE trop anciens pour une veille en direct.
 *
 * Constat mesuré (2026-11-10) : sur 4 683 événements `vuln`, 3 998 (85 %) sont
 * des CVE publiés en 1999-2000. Ils proviennent d'une source `feed:nist:…`
 * pointant sur l'API NVD sans paramètre de date (voir docs/cve-window.md).
 *
 * Critère : `family='vuln'` ET année du CVE extraite du titre
 * (`CVE-AAAA-NNN`) < année courante − 2. Les événements `vuln` sans identifiant
 * CVE dans le titre sont hors périmètre : ils ne sont jamais devinés.
 *
 * Filet de sécurité : avant toute suppression, les lignes visées sont copiées
 * dans `event_cve_archive` (créée si absente, mêmes colonnes que `event`). La
 * suppression n'efface que les lignes déjà présentes dans l'archive.
 *
 * Usage :
 *   pnpm exec tsx scripts/purge-old-cves.mts            # dry-run (défaut)
 *   pnpm exec tsx scripts/purge-old-cves.mts --apply    # archive + suppression
 *
 * Restauration : `INSERT INTO event SELECT * FROM event_cve_archive WHERE …`
 * puis retrait des lignes restaurées de l'archive.
 */
import { closePools, ingestPool, ingestQuery } from "../apps/api/src/db.js";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const ARCHIVE = "event_cve_archive";
/** Année du CVE dans le titre : « CVE-1999-0001 : … » ou « CVE-1999-0001 ». */
const CVE_YEAR_RE = String.raw`CVE-([0-9]{4})-[0-9]{4,}`;

interface YearRow {
  cve_year: number;
  n: number;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  ordinal_position: number;
}

function yearSql(): string {
  return `substring(e.title from '${CVE_YEAR_RE}')::int`;
}

async function archiveColumns(): Promise<ColumnRow[] | null> {
  const { rows } = await ingestQuery<ColumnRow>(
    `SELECT column_name, data_type, ordinal_position
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [ARCHIVE]
  );
  return rows.length > 0 ? rows : null;
}

async function eventColumns(): Promise<ColumnRow[]> {
  const { rows } = await ingestQuery<ColumnRow>(
    `SELECT column_name, data_type, ordinal_position
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event'
      ORDER BY ordinal_position`
  );
  return rows;
}

/** Vérifie que l'archive existante a exactement les colonnes de `event`. */
function assertSameShape(archive: ColumnRow[], source: ColumnRow[]): void {
  const a = archive.map((c) => `${c.column_name}:${c.data_type}`).join(",");
  const s = source.map((c) => `${c.column_name}:${c.data_type}`).join(",");
  if (a !== s) {
    throw new Error(`${ARCHIVE} existe avec une forme différente de event ; purge annulée.`);
  }
}

async function distribution(threshold: number): Promise<{ year: number; n: number }[]> {
  const { rows } = await ingestQuery<YearRow>(
    `SELECT ${yearSql()} AS cve_year, count(*)::int AS n
       FROM event e
      WHERE e.family = 'vuln'
        AND e.title ~ 'CVE-[0-9]{4}-[0-9]{4,}'
        AND ${yearSql()} < $1
      GROUP BY 1
      ORDER BY 1`,
    [threshold]
  );
  return rows.map((r) => ({ year: Number(r.cve_year), n: Number(r.n) }));
}

async function scopedCount(threshold: number): Promise<number> {
  const { rows } = await ingestQuery<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM event e
      WHERE e.family = 'vuln'
        AND e.title ~ 'CVE-[0-9]{4}-[0-9]{4,}'
        AND ${yearSql()} < $1`,
    [threshold]
  );
  return Number(rows[0]?.n ?? "0");
}

async function main(): Promise<void> {
  const currentYear = new Date().getUTCFullYear();
  const threshold = currentYear - 2;

  const sourceCols = await eventColumns();
  const archiveCols = await archiveColumns();

  const years = await distribution(threshold);
  const total = years.reduce((sum, y) => sum + y.n, 0);
  const scoped = await scopedCount(threshold);

  console.log(APPLY ? "PURGE RÉELLE (--apply)" : "DRY-RUN : rien ne sera écrit ni supprimé");
  console.log(`critère : family='vuln' et année CVE < ${threshold} (année courante ${currentYear} − 2)`);
  console.log(`archive : ${ARCHIVE} ${archiveCols ? "présente" : "absente (créée au moment de l'apply)"}`);
  console.log(`\nannée | lignes visées`);
  for (const y of years) console.log(`${y.year}  | ${String(y.n).padStart(6)}`);
  console.log(`total | ${String(total).padStart(6)}`);
  if (scoped !== total) throw new Error(`incohérence : ${scoped} lignes correspondent au SQL, ${total} au regroupement`);

  if (archiveCols) {
    const { rows: inArchive } = await ingestQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${ARCHIVE} a
        JOIN event e ON e.id = a.id
       WHERE e.family = 'vuln' AND e.title ~ 'CVE-[0-9]{4}-[0-9]{4,}' AND ${yearSql()} < $1`,
      [threshold]
    );
    console.log(`déjà archivées : ${inArchive[0]?.n ?? "0"}`);
  } else {
    console.log("déjà archivées : 0 (archive absente)");
  }
  if (DRY_RUN) return;

  const client = await ingestPool.connect();
  try {
    await client.query("BEGIN");
    if (!archiveCols) {
      await client.query(`CREATE TABLE IF NOT EXISTS ${ARCHIVE} (LIKE event)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${ARCHIVE}_id_key ON ${ARCHIVE} (id)`);
    }
    if (sourceCols.length === 0) throw new Error("table event introuvable");
    if (archiveCols) assertSameShape(archiveCols, sourceCols);

    const inserted = await client.query(
      `INSERT INTO ${ARCHIVE}
       SELECT e.* FROM event e
        WHERE e.family = 'vuln'
          AND e.title ~ 'CVE-[0-9]{4}-[0-9]{4,}'
          AND ${yearSql()} < $1
          AND NOT EXISTS (SELECT 1 FROM ${ARCHIVE} a WHERE a.id = e.id)`,
      [threshold]
    );
    console.log(`archivées : ${inserted.rowCount ?? 0}`);

    const deleted = await client.query(
      `DELETE FROM event e
        WHERE e.family = 'vuln'
          AND e.title ~ 'CVE-[0-9]{4}-[0-9]{4,}'
          AND ${yearSql()} < $1
          AND EXISTS (SELECT 1 FROM ${ARCHIVE} a WHERE a.id = e.id)`,
      [threshold]
    );
    console.log(`supprimées : ${deleted.rowCount ?? 0}`);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => closePools());
