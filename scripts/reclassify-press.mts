/**
 * Isole la presse régionale cyber dans la famille `presse_cyber`.
 *
 * Mesure du 2026-11-10 : 1 797 événements en famille `presse`, dont la très
 * grande majorité n'a aucun rapport avec le cyber. La règle retenue par
 * l'utilisateur est un croisement de deux conditions :
 *
 *   1. le texte (titre + résumé) contient un terme cyber — le prédicat
 *      `isCyberText` de `collectors/classify.ts` est IMPORTÉ, jamais recopié ;
 *   2. le texte mentionne un département, une préfecture ou une commune de
 *      Nouvelle-Aquitaine, OU la source est régionale (identifiant `presse-*`
 *      ou `estorides:*`).
 *
 * Les deux conditions vraies → `presse_cyber`. Le reste demeure `presse`.
 *
 * Garanties :
 *   - `--dry-run` par défaut : la transaction complète (DDL + INSERT archive +
 *     UPDATE) est exécutée puis annulée, rien ne persiste.
 *   - `--apply` : copie chaque ligne visée dans `event_press_archive` (ligne
 *     entière en jsonb) puis bascule `family`, en une seule transaction.
 *   - Aucune suppression, aucune ligne hors `presse` touchée.
 *
 * Usage : pnpm exec tsx scripts/reclassify-press.mts [--apply]
 */
import type { PoolClient } from "pg";
import { closePools, withClient } from "../apps/api/src/db.js";
import { isCyberText, normalizeText } from "../apps/api/src/collectors/classify.js";

const APPLY = process.argv.includes("--apply");
const NEW_FAMILY = "presse_cyber";

/** Départements de Nouvelle-Aquitaine (nom usuel, accents retirés à l'usage). */
const DEPARTMENTS: readonly string[] = [
  "charente",
  "charente-maritime",
  "correze",
  "creuse",
  "dordogne",
  "gironde",
  "landes",
  "lot-et-garonne",
  "pyrenees-atlantiques",
  "deux-sevres",
  "vienne",
  "haute-vienne",
  "nouvelle-aquitaine",
];

/** Préfectures, plus les communes qui apparaissent dans les titres régionaux. */
const CITIES: readonly string[] = [
  "bordeaux",
  "perigueux",
  "angouleme",
  "la rochelle",
  "niort",
  "limoges",
  "poitiers",
  "gueret",
  "tulle",
  "agen",
  "mont-de-marsan",
  "pau",
  "bayonne",
  "biarritz",
  "brive",
  "rochefort",
  "saintes",
  "cognac",
  "royan",
  "arcachon",
  "merignac",
  "pessac",
  "begles",
  "talence",
  "chatellerault",
  "bressuire",
  "parthenay",
  "oloron",
  "orthez",
  "dax",
  "libourne",
  "bergerac",
  "villeneuve-sur-lot",
  "sarlat",
];

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mot entier, frontières Unicode lettres/chiffres : « pau » ne matche pas « Paul ». */
function regionPattern(term: string): string {
  return String.raw`(?<![\p{L}\p{N}])` + escapeRegExp(normalizeText(term)) + String.raw`(?![\p{L}\p{N}])`;
}

const REGION_TERMS: readonly string[] = [...DEPARTMENTS, ...CITIES].map(normalizeText);
const REGION_RE = new RegExp(REGION_TERMS.map(regionPattern).join("|"), "u");

/** Vrai si le texte normalisé nomme un département, une préfecture ou une commune. */
function mentionsRegion(text: string): boolean {
  return REGION_RE.test(text);
}

/** Sources dont l'identifiant trahit une couverture régionale directe. */

interface PressRow {
  id: string;
  title: string;
  summary: string | null;
  source_id: string;
  source_name: string;
}

type Verdict = "region_texte" | "source_regionale";

interface Target {
  id: string;
  title: string;
  sourceId: string;
  verdict: Verdict;
}

interface Sample {
  title: string;
  sourceName: string;
  verdict: Verdict | "reste_presse";
}

const ARCHIVE_DDL = `
CREATE TABLE IF NOT EXISTS event_press_archive (
  event_id     bigint PRIMARY KEY,
  old_family   text   NOT NULL,
  new_family   text   NOT NULL,
  source_id    text   NOT NULL,
  source_name  text   NOT NULL,
  reason       text   NOT NULL,
  row_data     jsonb  NOT NULL,
  archived_at  timestamptz NOT NULL DEFAULT now()
)`;

function decide(row: PressRow): Verdict | null {
  if (!isCyberText(row.title, row.summary)) return null;
  const haystack = normalizeText(row.summary ? `${row.title} ${row.summary}` : row.title);
  // Les deux conditions sont exigées : un article doit parler de cyber **et**
  // nommer un lieu de la région. Le seul identifiant de source ne suffit pas —
  // il admettait des articles tech nationaux qui ne concernent pas la région.
  if (mentionsRegion(haystack)) return "region_texte";
  return null;
}

async function distribution(client: PoolClient): Promise<Map<string, number>> {
  const res = await client.query<{ family: string; n: string }>(
    "SELECT family, count(*)::text AS n FROM event GROUP BY family ORDER BY family",
  );
  return new Map(res.rows.map((r) => [r.family, Number(r.n)]));
}

function showDistribution(label: string, dist: Map<string, number>): void {
  const parts = [...dist.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f}=${n}`);
  console.log(`${label} : ${parts.join("  ")}`);
}

function showSamples(label: string, samples: readonly Sample[]): void {
  console.log(`${label} (${samples.length} exemple(s)) :`);
  for (const s of samples) {
    console.log(`  - [${s.verdict}] ${s.title} — ${s.sourceName}`);
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  await withClient(async (client) => {
    const { rows } = await client.query<PressRow>(
      `SELECT e.id::text AS id, e.title, e.summary, e.source_id, s.name AS source_name
         FROM event e JOIN source s ON s.id = e.source_id
        WHERE e.family = 'presse'
        ORDER BY e.id`,
    );

    const targets: Target[] = [];
    const sampleTargets: Sample[] = [];
    const stayed: Sample[] = [];
    for (const row of rows) {
      const verdict = decide(row);
      if (verdict) {
        targets.push({ id: row.id, title: row.title, sourceId: row.source_id, verdict });
        if (sampleTargets.length < 5) {
          sampleTargets.push({ title: row.title, sourceName: row.source_name, verdict });
        }
      } else if (stayed.length < 5) {
        stayed.push({ title: row.title, sourceName: row.source_name, verdict: "reste_presse" });
      }
    }

    console.log(`scannés : ${rows.length} événement(s) presse, visés : ${targets.length}`);
    if (targets.length === 0) {
      console.log("rien à reclasser");
      return;
    }

    const movedByVerdict = { region_texte: 0, source_regionale: 0 };
    for (const t of targets) movedByVerdict[t.verdict] += 1;
    console.log(
      `motifs : mention régionale dans le texte=${movedByVerdict.region_texte}  ` +
        `source régionale=${movedByVerdict.source_regionale}`,
    );

    const before = await distribution(client);
    const after = new Map(before);
    after.set("presse", (after.get("presse") ?? 0) - targets.length);
    after.set(NEW_FAMILY, (after.get(NEW_FAMILY) ?? 0) + targets.length);
    showDistribution("avant", before);
    showDistribution("après", after);

    showSamples("→ presse_cyber", sampleTargets);
    showSamples("→ reste presse", stayed);

    await client.query("BEGIN");
    try {
      await client.query(ARCHIVE_DDL);
      const ids = targets.map((t) => Number(t.id));
      const reasons = targets.map((t) => t.verdict);
      const archived = await client.query(
        `INSERT INTO event_press_archive (event_id, old_family, new_family, source_id, source_name, reason, row_data)
         SELECT e.id, e.family, $3, e.source_id, s.name, m.reason, to_jsonb(e)
           FROM event e
           JOIN source s ON s.id = e.source_id
           JOIN unnest($1::bigint[], $2::text[]) AS m(id, reason) ON m.id = e.id
          WHERE e.family = 'presse'
         ON CONFLICT (event_id) DO NOTHING`,
        [ids, reasons, NEW_FAMILY],
      );
      const updated = await client.query(
        `UPDATE event SET family = $2
          WHERE id = ANY($1::bigint[])
            AND family = 'presse'`,
        [ids, NEW_FAMILY],
      );
      console.log(`archivés : ${archived.rowCount ?? 0} ligne(s), basculés : ${updated.rowCount ?? 0}`);

      if (APPLY) {
        await client.query("COMMIT");
        console.log("APPLY : transaction validée");
      } else {
        await client.query("ROLLBACK");
        console.log("DRY-RUN : transaction annulée, aucune donnée modifiée");
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const check = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM event WHERE family = $1",
      [NEW_FAMILY],
    );
    console.log(`${NEW_FAMILY} en base maintenant : ${check.rows[0]?.n ?? "?"}`);
  });

  console.log(`terminé en ${Date.now() - startedAt} ms`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
